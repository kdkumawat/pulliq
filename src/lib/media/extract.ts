import { spawn } from "node:child_process";
import type { CarouselItem } from "./types";
import {
  extractDirectVideoUrl,
  fetchPageHtml,
  isVideoThumbnailUrl,
  parsePageDescription,
  parsePageTitle,
  parseSchemaVideoMeta,
  parseDimensionsFromVideoUrl,
} from "./page-fallback";

import { YT_DLP } from "./paths";
import { normalizeExtractionUrl } from "./platform";

/**
 * yt-dlp wrapper for Pulliq.
 *
 * Uses `--dump-json` which emits one JSON object per line. For playlists
 * (e.g. Instagram carousels), yt-dlp emits one line per slide.
 */
const EXTRACT_TIMEOUT_MS = 35_000;

/** A single downloadable format from yt-dlp. */
export interface RawFormat {
  format_id: string;
  ext?: string;
  height?: number;
  width?: number;
  filesize?: number;
  vcodec?: string;
  acodec?: string;
  fps?: number;
  tbr?: number;
  abr?: number;
  url?: string;
  resolution?: string;
}

/** Normalized result of a yt-dlp extraction. */
export interface RawExtract {
  title: string;
  creator: string;
  thumbnail: string;
  duration?: number;
  width?: number;
  height?: number;
  filesize?: number;
  formats: RawFormat[];
  carousel?: CarouselItem[];
  uploader?: string;
  uploadDate?: string; // ISO YYYY-MM-DD
  description?: string;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  webpageUrl?: string;
  extractor?: string;
  ext?: string;
  url?: string; // best direct media URL
  /** Whether the source has a video stream. */
  isVideo?: boolean;
}

/** Run yt-dlp with the given args, killing it on timeout. */
function runYtDlp(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(YT_DLP, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, LANG: "en_US.UTF-8" },
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer: NodeJS.Timeout | null = null;

    const finish = (err: Error | null, out?: string) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (err) reject(err);
      else resolve(out ?? "");
    };

    proc.stdout.on("data", (d: Buffer) => {
      stdout += d.toString("utf8");
    });
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
    });

    proc.on("error", (err) => finish(err));

    proc.on("close", (code) => {
      if (code === 0) finish(null, stdout);
      else {
        const tail = stderr.trim().slice(-400);
        finish(new Error(`yt-dlp exited ${code}${tail ? `: ${tail}` : ""}`));
      }
    });

    timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      finish(new Error(`yt-dlp timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
}

function pickStr(...vals: any[]): string {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && isFinite(v)) return String(v);
  }
  return "";
}

function pickNum(...vals: any[]): number | undefined {
  for (const v of vals) {
    if (typeof v === "number" && isFinite(v) && v > 0) return v;
  }
  return undefined;
}

function formatDate(yyyymmdd: string | undefined): string | undefined {
  if (!yyyymmdd || yyyymmdd.length !== 8) return undefined;
  const y = yyyymmdd.slice(0, 4);
  const m = yyyymmdd.slice(4, 6);
  const d = yyyymmdd.slice(6, 8);
  if (!/^\d{8}$/.test(yyyymmdd)) return undefined;
  return `${y}-${m}-${d}`;
}

function bestThumbnail(thumbs: any[], primary?: string): string {
  if (primary) return primary;
  if (!thumbs || !thumbs.length) return "";
  // Prefer the highest-resolution thumbnail entry.
  const sorted = [...thumbs].sort(
    (a, b) => (b.preference ?? 0) - (a.preference ?? 0)
  );
  for (const t of sorted) {
    if (typeof t?.url === "string" && t.url) return t.url;
  }
  return "";
}

function mapFormat(f: any): RawFormat {
  return {
    format_id: String(f.format_id ?? ""),
    ext: typeof f.ext === "string" ? f.ext : undefined,
    height: pickNum(f.height),
    width: pickNum(f.width),
    filesize: pickNum(f.filesize, f.filesize_approx),
    vcodec: typeof f.vcodec === "string" ? f.vcodec : undefined,
    acodec: typeof f.acodec === "string" ? f.acodec : undefined,
    fps: pickNum(f.fps),
    tbr: pickNum(f.tbr),
    abr: pickNum(f.abr),
    url: typeof f.url === "string" ? f.url : undefined,
    resolution: typeof f.resolution === "string" ? f.resolution : undefined,
  };
}

function mapCarouselSlide(s: any, i: number): CarouselItem {
  const thumbs: any[] = Array.isArray(s.thumbnails) ? s.thumbnails : [];
  const thumb = bestThumbnail(thumbs, s.thumbnail);
  const hasVideo =
    (typeof s.vcodec === "string" && s.vcodec && s.vcodec !== "none") ||
    (Array.isArray(s.formats) &&
      s.formats.some(
        (f: any) => f.vcodec && f.vcodec !== "none"
      ));
  const slideUrl =
    pickStr(s.url, (s.formats || []).slice(-1)[0]?.url) || undefined;
  return {
    id: String(s.id ?? s.url ?? `slide-${i}`),
    kind: hasVideo ? "video" : "image",
    url: slideUrl,
    thumbnail: thumb,
    title: pickStr(s.title) || undefined,
    width: pickNum(s.width),
    height: pickNum(s.height),
  };
}

function mapToRawExtract(info: any, slides: any[]): RawExtract {
  const rawFormats: RawFormat[] = Array.isArray(info.formats)
    ? info.formats.map(mapFormat).filter((f: RawFormat) => f.format_id)
    : [];

  // If there are no formats but a top-level url exists (e.g. a direct image),
  // synthesize a single format so the rest of the pipeline has something to use.
  if (!rawFormats.length && info.url) {
    rawFormats.push({
      format_id: "0",
      ext: typeof info.ext === "string" ? info.ext : undefined,
      url: info.url,
      width: pickNum(info.width),
      height: pickNum(info.height),
      filesize: pickNum(info.filesize, info.filesize_approx),
      vcodec: typeof info.vcodec === "string" ? info.vcodec : undefined,
      acodec: typeof info.acodec === "string" ? info.acodec : undefined,
      fps: pickNum(info.fps),
      tbr: pickNum(info.tbr),
      abr: pickNum(info.abr),
      resolution: typeof info.resolution === "string" ? info.resolution : undefined,
    });
  }

  // Pick best progressive mp4 (has both vcodec + acodec, ext mp4) by height.
  const progressive = rawFormats
    .filter(
      (f) =>
        f.vcodec &&
        f.acodec &&
        f.vcodec !== "none" &&
        f.acodec !== "none" &&
        (f.ext === "mp4" || (f.url ?? "").includes(".mp4"))
    )
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  const best = progressive[0] || rawFormats[0];

  const creator = pickStr(
    info.uploader,
    info.channel,
    info.uploader_fullname,
    info.creator
  );

  const thumbnails: any[] = Array.isArray(info.thumbnails)
    ? info.thumbnails
    : [];
  const thumbnail = bestThumbnail(thumbnails, info.thumbnail);

  let carousel: CarouselItem[] | undefined;
  if (slides.length > 0) {
    carousel = slides.map(mapCarouselSlide);
  } else if (Array.isArray(info.entries) && info.entries.length > 0) {
    carousel = info.entries.map(mapCarouselSlide);
  }

  const isVideo =
    (typeof info.vcodec === "string" && info.vcodec && info.vcodec !== "none") ||
    !!info.duration ||
    (Array.isArray(info.formats) &&
      info.formats.some((f: any) => f.vcodec && f.vcodec !== "none"));

  return {
    title: pickStr(info.title, info.fulltitle) || "Untitled media",
    creator,
    thumbnail,
    duration: pickNum(info.duration),
    width: pickNum(info.width, best?.width),
    height: pickNum(info.height, best?.height),
    filesize: pickNum(info.filesize, info.filesize_approx, best?.filesize),
    formats: rawFormats,
    carousel,
    uploader: pickStr(info.uploader, info.channel) || undefined,
    uploadDate: formatDate(info.upload_date),
    description: typeof info.description === "string" ? info.description : undefined,
    viewCount: pickNum(info.view_count),
    likeCount: pickNum(info.like_count),
    commentCount: pickNum(info.comment_count),
    webpageUrl: pickStr(info.webpage_url, info.original_url) || undefined,
    extractor: pickStr(info.extractor, info.extractor_key) || undefined,
    ext: pickStr(info.ext, best?.ext) || undefined,
    url: pickStr(info.url, best?.url) || undefined,
    isVideo,
  };
}

/**
 * Extract media info from a URL via yt-dlp.
 *
 * Throws a typed Error on timeout, parse failure, or non-zero exit.
 * The caller is expected to fall back to a demo response on failure.
 */
export async function extractMedia(url: string): Promise<RawExtract> {
  const targetUrl = normalizeExtractionUrl(url);
  let ytErr: Error | null = null;
  try {
    const out = await runYtDlp(
      ["--no-warnings", "--no-playlist", "--skip-download", "--dump-json", targetUrl],
      EXTRACT_TIMEOUT_MS
    );

    const lines = out
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (!lines.length) {
      throw new Error("yt-dlp produced no output");
    }

    const parsed: any[] = [];
    for (const line of lines) {
      try {
        parsed.push(JSON.parse(line));
      } catch {
        /* skip unparseable lines (e.g. progress noise) */
      }
    }

    if (!parsed.length) {
      throw new Error("Failed to parse yt-dlp JSON output");
    }

    // With --no-playlist, we usually get one JSON object. For carousels
    // (e.g. Instagram) yt-dlp may still emit multiple lines even with
    // --no-playlist - collect them all as carousel slides.
    const [main, ...rest] = parsed;
    return mapToRawExtract(main, rest);
  } catch (err) {
    ytErr = err as Error;
  }

  // Fallback: try extracting an image via og:image from the page HTML.
  // This handles Twitter/X image posts, Pinterest pins, and other pages
  // where yt-dlp can't find video but the page has a public image.
  const imageFallback = await tryImageFallback(targetUrl);
  if (imageFallback) {
    return imageFallback;
  }

  // No image found either - re-throw the original yt-dlp error.
  throw ytErr ?? new Error("Media extraction failed");
}

/**
 * Fallback: fetch the page HTML and extract og:image / og:video meta tags.
 * Used when yt-dlp can't find video (e.g. Twitter image posts, LinkedIn).
 * Returns a RawExtract with kind=image or kind=video, or null if no media found.
 */
async function tryImageFallback(url: string): Promise<RawExtract | null> {
  try {
    const html = await fetchPageHtml(url);
    if (!html) return null;

    const siteMatch =
      /<meta\s+property=["']og:site_name["']\s+content=["']([^"']*)["']/i.exec(html);
    const title = parsePageTitle(html);
    const description = parsePageDescription(html);
    const schema = parseSchemaVideoMeta(html);

    const PLACEHOLDER_PATTERNS = [
      /abs\.twimg\.com\/rweb\/ssr\/default/i,
      /static\.licdn\.com\/sc\/ds\/common\/u\/images/i,
      /facebook\.com\/images\/fb-icon/i,
      /default-og-image/i,
    ];
    const isPlaceholder = (u: string) =>
      PLACEHOLDER_PATTERNS.some((p) => p.test(u));

    const images = new Set<string>();
    const imgRegex =
      /<meta\s+(?:property|name)=["'](?:og:image|twitter:image)(?::url)?["']\s+content=["']([^"']+)["']/gi;
    let match;
    while ((match = imgRegex.exec(html)) !== null) {
      const imgUrl = match[1].trim();
      if (imgUrl && imgUrl.startsWith("http") && !isPlaceholder(imgUrl)) {
        images.add(imgUrl);
      }
    }
    const thumbnail = images.size > 0 ? Array.from(images)[0] : "";

    // Video first (X schema.org, YouTube player JSON, Instagram video_url, og:video mp4).
    const videoUrl = extractDirectVideoUrl(html);
    if (videoUrl) {
      const vext =
        videoUrl.match(/\.(mp4|webm|mov|m4v)/i)?.[1]?.toLowerCase() || "mp4";
      const urlDims = parseDimensionsFromVideoUrl(videoUrl);
      return {
        title,
        creator: siteMatch?.[1] || "",
        thumbnail,
        duration: schema.duration,
        width: schema.width || urlDims.width,
        height: schema.height || urlDims.height,
        formats: [
          {
            format_id: "0",
            ext: vext,
            url: videoUrl,
            width: schema.width || urlDims.width,
            height: schema.height || urlDims.height,
            vcodec: "none",
            acodec: "none",
          },
        ],
        uploader: siteMatch?.[1] || undefined,
        description,
        url: videoUrl,
        isVideo: true,
        extractor: "og-video-fallback",
      };
    }

    if (images.size === 0) return null;

    const imgUrl = Array.from(images)[0];
    // X/YouTube video posts use thumbnail URLs in og:image - not real images.
    if (isVideoThumbnailUrl(imgUrl)) return null;

    const ext =
      imgUrl.match(/\.(jpg|jpeg|png|webp|gif)/i)?.[1]?.toLowerCase() || "jpg";

    return {
      title: title || "Image",
      creator: siteMatch?.[1] || "",
      thumbnail: imgUrl,
      formats: [
        {
          format_id: "0",
          ext,
          url: imgUrl,
          vcodec: undefined,
          acodec: undefined,
        },
      ],
      carousel:
        images.size > 1
          ? Array.from(images).slice(0, 4).map((u, i) => ({
              id: `image-${i}`,
              kind: "image" as const,
              url: u,
              thumbnail: u,
            }))
          : undefined,
      uploader: siteMatch?.[1] || undefined,
      description,
      url: imgUrl,
      isVideo: false,
      extractor: "og-image-fallback",
    };
  } catch {
    return null;
  }
}

/**
 * Resolve a direct media URL for a given format id via yt-dlp.
 * Used by the download route. Returns null on failure.
 */
export async function resolveMediaUrl(
  url: string,
  formatId: string,
  timeoutMs = 30_000
): Promise<string | null> {
  try {
    const out = await runYtDlp(
      ["--no-warnings", "--no-playlist", "-f", formatId, "--get-url", url],
      timeoutMs
    );
    const direct = out.trim().split("\n")[0];
    return direct || null;
  } catch {
    return null;
  }
}
