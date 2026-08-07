import { NextResponse } from "next/server";
import {
  detectPlatform,
  getPlatformInfo,
  isValidHttpUrl,
  UNSUPPORTED_PLATFORMS,
} from "@/lib/media/platform";
import { extractMedia, type RawExtract, type RawFormat } from "@/lib/media/extract";
import { buildMetadataFromExtract } from "@/lib/media/metadata";
import { assertSafeUrl } from "@/lib/media/ssrf";
import type { AnalyzeResponse, MediaFormat, MediaKind } from "@/lib/media/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ---------- rate limit (in-process, lightweight) ---------- */

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 12;
const rateMap = new Map<string, number[]>();

function rateLimit(ip: string): boolean {
  const now = Date.now();
  if (rateMap.size > 2000) rateMap.clear();
  const arr = (rateMap.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) {
    rateMap.set(ip, arr);
    return false;
  }
  arr.push(now);
  rateMap.set(ip, arr);
  return true;
}

function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

/* ---------- helpers ---------- */

function extractHashtags(text?: string): string[] | undefined {
  if (!text) return undefined;
  const matches = text.match(/#[\w\u00C0-\u024F]+/g);
  if (!matches || !matches.length) return undefined;
  return Array.from(new Set(matches)).slice(0, 12);
}

function pickBestFormat(raw: RawExtract): RawFormat | undefined {
  if (!raw.formats.length) return undefined;
  // Prefer progressive mp4 (has both vcodec + acodec, ext mp4) by height.
  const progressive = raw.formats
    .filter(
      (f) =>
        f.vcodec &&
        f.acodec &&
        f.vcodec !== "none" &&
        f.acodec !== "none" &&
        (f.ext === "mp4" || (f.url ?? "").includes(".mp4"))
    )
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  return progressive[0] || raw.formats[0];
}

function detectKind(raw: RawExtract, best?: RawFormat): MediaKind {
  if (raw.carousel && raw.carousel.length > 0) return "carousel";
  const hasVideoCodec =
    (best?.vcodec && best.vcodec !== "none" && best.vcodec !== undefined) ||
    (Array.isArray((raw as any).formats) &&
      (raw as any).formats.some((f: RawFormat) => f.vcodec && f.vcodec !== "none"));
  const hasAudioCodec =
    (best?.acodec && best.acodec !== "none") ||
    (Array.isArray((raw as any).formats) &&
      (raw as any).formats.some((f: RawFormat) => f.acodec && f.acodec !== "none"));
  const isImageUrl =
    (best?.ext && /(jpg|jpeg|png|webp|gif)/i.test(best.ext)) ||
    (best?.url ?? "").match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i) !== null;

  // og-video-fallback extractor sets isVideo=true and the url is a direct mp4.
  if (raw.isVideo === true && !isImageUrl) return "video";
  // og-image-fallback extractor sets isVideo=false.
  if (raw.isVideo === false && isImageUrl) return "image";

  // Audio-only: has audio but no video stream.
  if (hasAudioCodec && !hasVideoCodec && !isImageUrl) return "audio";
  if (raw.isVideo === false && hasAudioCodec) return "audio";

  if (hasVideoCodec) return "video";
  if (isImageUrl) return "image";
  if (raw.duration && !isImageUrl) return "audio";
  return "unknown";
}

function buildFormats(
  raw: RawExtract,
  best?: RawFormat
): MediaFormat[] {
  const out: MediaFormat[] = [];
  const height = best?.height || raw.height || 0;
  const width = best?.width || raw.width || 0;
  const filesize = best?.filesize || raw.filesize;
  const kind = detectKind(raw, best);
  const isImage = kind === "image";
  const isAudio = kind === "audio";

  // For audio, the "original" is the source audio file.
  if (isAudio) {
    out.push({
      id: "original",
      label: "Original",
      quality: "Source audio",
      ext: best?.ext || raw.ext || "m4a",
      kind: "audio",
      filesize,
      isOriginal: true,
      url: best?.url || raw.url,
    });
    out.push({
      id: "mp3-128",
      label: "MP3",
      quality: "128 kbps",
      ext: "mp3",
      kind: "audio",
      filesize: raw.duration ? Math.round(raw.duration * 16 * 1024) : undefined,
      note: "Audio only",
    });
    return out;
  }

  const ext = best?.ext || raw.ext || "mp4";

  out.push({
    id: "original",
    label: "Original",
    quality: height ? `${height}p` : "Source",
    ext,
    kind: isImage ? "image" : "video",
    filesize,
    width: width || undefined,
    height: height || undefined,
    isOriginal: true,
    url: best?.url || raw.url,
  });

  if (isImage) return out;

  // Transcode renditions <= source height.
  const renditions = [1080, 720, 480].filter((h) => h <= height);
  for (const h of renditions) {
    const w = height ? Math.round((width * h) / height) : undefined;
    out.push({
      id: `mp4-${h}`,
      label: `${h}p`,
      quality: `${h}p`,
      ext: "mp4",
      kind: "video",
      filesize: filesize ? Math.round(filesize * (h / height)) : undefined,
      width: w,
      height: h,
      note: "Transcoded MP4 (H.264)",
    });
  }

  // MP3 always available for videos.
  out.push({
    id: "mp3-128",
    label: "MP3",
    quality: "128 kbps",
    ext: "mp3",
    kind: "audio",
    filesize: raw.duration ? Math.round(raw.duration * 16 * 1024) : undefined,
    note: "Audio only",
  });

  return out;
}

/* ---------- route handlers ---------- */

export async function POST(req: Request) {
  const ip = getClientIp(req);
  if (!rateLimit(ip)) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Cache-Control": "no-store" } }
    );
  }

  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const url = typeof body?.url === "string" ? body.url.trim() : "";

  if (!url || !isValidHttpUrl(url)) {
    return NextResponse.json(
      { ok: false, error: "Invalid URL" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const platform = detectPlatform(url);
  const startedAt = Date.now();

  // Reject DRM-protected streaming platforms upfront with a clear message.
  if (UNSUPPORTED_PLATFORMS.has(platform)) {
    const info = getPlatformInfo(platform);
    const name = info?.name ?? platform;
    return NextResponse.json(
      {
        ok: false,
        platform,
        error: `${name} uses DRM-protected streams that Pulliq can't download. Try a link from YouTube, YouTube Music, or SoundCloud instead.`,
      },
      { status: 422, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    // SSRF guard - throws on private/loopback URLs.
    await assertSafeUrl(url);

    const raw = await extractMedia(url);
    const best = pickBestFormat(raw);
    const formats = buildFormats(raw, best);
    const metadata = buildMetadataFromExtract(raw, platform, best);
    const kind = detectKind(raw, best);

    const info = getPlatformInfo(platform);
    const response: AnalyzeResponse = {
      ok: true,
      platform,
      platformLabel: info?.name || "Unknown",
      kind,
      title: raw.title,
      creator: raw.creator,
      thumbnail: raw.thumbnail,
      duration: raw.duration,
      width: best?.width || raw.width,
      height: best?.height || raw.height,
      filesize: best?.filesize || raw.filesize,
      url,
      mediaUrl: best?.url || raw.url || undefined,
      formats,
      carousel: raw.carousel,
      metadata,
      social: {
        caption: raw.description,
        uploadDate: raw.uploadDate,
        username: raw.uploader || raw.creator,
        likes: raw.likeCount,
        comments: raw.commentCount,
        hashtags: extractHashtags(raw.description),
        thumbnail: raw.thumbnail,
        platform,
      },
      demo: false,
      tookMs: Date.now() - startedAt,
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    // Be honest: if we can't access the link, say so clearly - no fake content.
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[analyze] extraction failed for ${url}:`, msg);
    const reason = friendlyFailureReason(msg, platform);
    return NextResponse.json(
      {
        ok: false,
        platform,
        error: reason,
      },
      { status: 422, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "POST /api/analyze",
    description:
      "Analyze a media URL and return metadata + available formats. Returns a 422 error if the link cannot be accessed.",
    body: { url: "string" },
    rateLimit: `${RATE_MAX} requests per minute per IP`,
  });
}

/** Turn a raw error into a clear, honest, user-facing message. */
function friendlyFailureReason(msg: string, platform: string): string {
  const lower = msg.toLowerCase();
  const platName = capitalize(platform);
  // LinkedIn and Facebook require authentication for most content.
  if (platform === "linkedin" || platform === "facebook") {
    return `${platName} requires login to view most content, so Pulliq can't access it. Try a public post or a different platform.`;
  }
  if (lower.includes("timed out")) {
    return "This link took too long to respond. Please try again in a moment.";
  }
  if (lower.includes("private") || lower.includes("login") || lower.includes("sign in") || lower.includes("unauthorized")) {
    return "This content isn't publicly accessible. Pulliq only works with public links.";
  }
  if (lower.includes("no video") || lower.includes("not found") || lower.includes("404")) {
    return "No media could be found at this link. Check that the URL is correct and public.";
  }
  if (lower.includes("unexpected response") || lower.includes("blocked")) {
    return `${platName} blocked automated access to this link, so Pulliq couldn't fetch it. Try a different link or platform.`;
  }
  if (lower.includes("unsupported url") || lower.includes("no suitable")) {
    return "This platform or link isn't supported. Pulliq works with public links from YouTube, Instagram, TikTok, X, Reddit, Pinterest, Vimeo, SoundCloud, and more.";
  }
  return "Pulliq couldn't access this link. It may be private, region-locked, or the platform may block automated access. Please check the link and try again.";
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
