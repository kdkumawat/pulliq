import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import type { CarouselItem } from "./types";

import { YT_DLP } from "./paths";
import { PROCESS_SEM } from "./concurrency";
import { detectPlatform } from "./platform";

/**
 * yt-dlp wrapper for Pulliq.
 *
 * Uses `--dump-json` which emits one JSON object per line. For playlists
 * (e.g. Instagram carousels), yt-dlp emits one line per slide.
 *
 * Extraction is multi-strategy: if the default player client fails (YouTube
 * frequently blocks/changes clients), we retry with alternate player clients
 * and IPv4-only. When every yt-dlp strategy fails we fall back to parsing the
 * page's Open Graph / Twitter Card / JSON-LD meta tags, which recovers
 * direct videos (og:video, twitter:player:stream) and images (og:image).
 */
const EXTRACT_TIMEOUT_MS = 35_000;
/** Guard against runaway yt-dlp output (should never be hit for normal media). */
const MAX_DUMP_BYTES = 64 * 1024 * 1024;

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

/* ------------------------------------------------------------------ */
/* process runner                                                      */
/* ------------------------------------------------------------------ */

/** Run yt-dlp with the given args, gated by the global process semaphore. */
function runYtDlp(args: string[], timeoutMs: number): Promise<string> {
  return PROCESS_SEM.run(
    () =>
      new Promise((resolve, reject) => {
        const proc = spawn(YT_DLP, args, {
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            ...process.env,
            LANG: "en_US.UTF-8",
            PYTHONIOENCODING: "utf-8",
          },
        });
        let stdout = "";
        let stderr = "";
        let settled = false;
        let overLimit = false;
        let timer: NodeJS.Timeout | null = null;

        const finish = (err: Error | null, out?: string) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          if (err) reject(err);
          else resolve(out ?? "");
        };

        proc.stdout.on("data", (d: Buffer) => {
          if (overLimit) return;
          stdout += d.toString("utf8");
          if (stdout.length > MAX_DUMP_BYTES) {
            overLimit = true;
            try {
              proc.kill("SIGKILL");
            } catch {
              /* ignore */
            }
            finish(new Error("yt-dlp output exceeded size limit"));
          }
        });
        proc.stderr.on("data", (d: Buffer) => {
          stderr += d.toString("utf8");
        });

        proc.on("error", (err) => finish(err));

        proc.on("close", (code) => {
          if (overLimit) return; // already finished
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
      }),
    timeoutMs + 20_000
  );
}

/** Optional cookies file so authenticated/locked content can be fetched. */
function cookiesArgs(): string[] {
  const cookies = process.env.YT_DLP_COOKIES;
  if (cookies && existsSync(cookies)) {
    return ["--cookies", cookies];
  }
  return [];
}

/* ------------------------------------------------------------------ */
/* mapping helpers                                                     */
/* ------------------------------------------------------------------ */

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
  const sorted = [...thumbs].sort(
    (a, b) => (b.preference ?? 0) - (a.preference ?? 0)
  );
  for (const t of sorted) {
    if (typeof t?.url === "string" && t.url) return t.url;
  }
  return "";
}

const IMAGE_EXT_RE = /\.(jpg|jpeg|png|webp|gif|avif|heic|bmp|svg)(\?|$)/i;

/** True when a format/url points at a still image rather than video/audio. */
export function isImageMediaUrl(url?: string, ext?: string): boolean {
  if (ext && /^(jpg|jpeg|png|webp|gif|avif|heic|bmp|svg)$/i.test(ext)) return true;
  if (url && IMAGE_EXT_RE.test(url)) return true;
  return false;
}

const DIRECT_IMAGE_EXT = /^(jpg|jpeg|png|webp|gif|avif|heic|bmp)$/i;
const DIRECT_AUDIO_EXT = /^(m4a|mp3|ogg|oga|wav|aac|flac|opus)$/i;
const DIRECT_VIDEO_EXT = /^(mp4|webm|mov|m4v)$/i;

/**
 * When the pasted URL is itself a direct media file (ends with a media
 * extension), no extractor is needed - we can synthesize the result.
 * Returns { ext, kind } or null when the URL is not a direct media file.
 */
export function matchDirectMediaUrl(url: string): { ext: string; kind: "image" | "video" | "audio" } | null {
  let pathname = "";
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const m = pathname.match(/\.([a-z0-9]{2,5})$/i);
  const ext = m?.[1]?.toLowerCase() ?? "";
  if (DIRECT_IMAGE_EXT.test(ext)) return { ext, kind: "image" };
  if (DIRECT_AUDIO_EXT.test(ext)) return { ext, kind: "audio" };
  if (DIRECT_VIDEO_EXT.test(ext)) return { ext, kind: "video" };
  return null;
}

/**
 * Pick the best playable format for previews/downloads. Prefers progressive
 * mp4 video by height, then any video with a direct URL, then audio, then any
 * direct URL. Never returns an image format when a media format exists
 * (this is what previously caused videos to be rendered as images).
 */
export function pickBestMediaFormat(raw: RawExtract): RawFormat | undefined {
  if (!raw.formats.length) return undefined;
  const hasUrl = raw.formats.filter((f) => f.url && !isImageMediaUrl(f.url, f.ext));
  const video = hasUrl.filter((f) => f.vcodec && f.vcodec !== "none");
  const audio = hasUrl.filter(
    (f) => !video.includes(f) && f.acodec && f.acodec !== "none"
  );

  const progressive = video
    .filter((f) => f.ext === "mp4" || (f.url ?? "").includes(".mp4"))
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  if (progressive.length) return progressive[0];

  if (video.length) {
    return [...video].sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];
  }
  if (audio.length) return audio[0];
  if (hasUrl.length) return hasUrl[0];

  // Last resort: any format with a URL, or the first format.
  return raw.formats.find((f) => f.url) ?? raw.formats[0];
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
      s.formats.some((f: any) => f.vcodec && f.vcodec !== "none"));
  const slideUrl = pickStr(s.url, (s.formats || []).slice(-1)[0]?.url) || undefined;
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

  const best = pickBestMediaFormat({
    title: "",
    creator: "",
    thumbnail: "",
    formats: rawFormats,
  });

  const creator = pickStr(
    info.uploader,
    info.channel,
    info.uploader_fullname,
    info.creator
  );

  const thumbnails: any[] = Array.isArray(info.thumbnails) ? info.thumbnails : [];
  const thumbnail = bestThumbnail(thumbnails, info.thumbnail);

  let carousel: CarouselItem[] | undefined;
  if (slides.length > 0) {
    carousel = slides.map(mapCarouselSlide);
  } else if (Array.isArray(info.entries) && info.entries.length > 0) {
    carousel = info.entries.map(mapCarouselSlide);
  }

  const isVideo =
    (typeof info.vcodec === "string" && !!info.vcodec && info.vcodec !== "none") ||
    !!info.duration ||
    (Array.isArray(info.formats) &&
      info.formats.some((f: any) => f.vcodec && f.vcodec !== "none" && f.url));

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

/* ------------------------------------------------------------------ */
/* extraction                                                          */
/* ------------------------------------------------------------------ */

/** Build ordered yt-dlp arg strategies for a URL. */
function buildStrategies(url: string): string[][] {
  const platform = detectPlatform(url);
  const base = [
    "--no-warnings",
    "--no-playlist",
    "--skip-download",
    "--dump-json",
    url,
  ];
  const ck = cookiesArgs();

  const strategies: string[][] = [[...base, ...ck]];

  if (platform === "youtube" || platform === "youtube-music") {
    // YouTube is the most fragile extractor. Try alternate player clients,
    // then IPv4-only (broken IPv6 causes "network is unreachable" errors).
    const client = process.env.YT_DLP_PLAYER_CLIENT ?? "default,-android_sdkless";
    strategies.push([
      ...base,
      "--extractor-args",
      `youtube:player_client=${client}`,
      ...ck,
    ]);
    strategies.push([
      ...base,
      "--extractor-args",
      "youtube:player_client=android,default",
      ...ck,
    ]);
    strategies.push([...base, "--extractor-args", "youtube:player_client=tv_embedded,default", ...ck]);
    strategies.push(["-4", ...base, ...ck]);
  } else {
    // Generic retry, plus IPv4-only as a second attempt.
    strategies.push(["-4", ...base, ...ck]);
  }

  return strategies;
}

/**
 * Extract media info from a URL via yt-dlp.
 *
 * Tries each yt-dlp strategy in order, then falls back to parsing the page's
 * meta tags (og:video / twitter:player:stream / og:image / JSON-LD). Direct
 * media file URLs (a bare .jpg/.mp4/.mp3 link) are handled without yt-dlp.
 * Throws a typed Error if everything fails. The caller is expected to
 * surface a friendly error on failure.
 */
export async function extractMedia(url: string): Promise<RawExtract> {
  // Direct media file: no extractor needed, synthesize immediately.
  const direct = matchDirectMediaUrl(url);
  if (direct) {
    const filename = decodeURIComponent(url.split("/").pop() ?? "")
      .replace(/\.[a-z0-9]+(\?.*)?$/i, "")
      .replace(/[-_]+/g, " ")
      .trim() || "Media";
    return {
      title: filename,
      creator: "",
      thumbnail: direct.kind === "image" ? url : "",
      formats: [
        {
          format_id: "0",
          ext: direct.ext,
          url,
          vcodec: direct.kind === "video" ? "h264" : undefined,
          acodec: direct.kind === "audio" ? "aac" : undefined,
        },
      ],
      url,
      ext: direct.ext,
      isVideo: direct.kind === "video",
      extractor: "direct-file",
    };
  }

  const strategies = buildStrategies(url);
  let lastErr: Error | null = null;

  for (const args of strategies) {
    try {
      const out = await runYtDlp(args, EXTRACT_TIMEOUT_MS);
      const parsed = parseDumpOutput(out);
      if (!parsed.length) continue;
      const [main, ...rest] = parsed;
      return mapToRawExtract(main, rest);
    } catch (err) {
      // If the server is saturated, fail fast - don't queue-wait for every
      // remaining strategy (each would wait another ~55s).
      if ((err as Error).message.includes("Server is busy")) {
        throw err;
      }
      lastErr = err as Error;
    }
  }

  // Fallback: extract direct media from the page's meta tags. Handles
  // Twitter/X image posts, Pinterest pins, and pages where yt-dlp can't find
  // a video but the page exposes one via og:video or JSON-LD.
  const fallback = await tryMetaFallback(url);
  if (fallback) return fallback;

  throw lastErr ?? new Error("Media extraction failed");
}

/** Parse yt-dlp dump-json output into JSON objects (one per line). */
function parseDumpOutput(out: string): any[] {
  const parsed: any[] = [];
  for (const line of out.split("\n")) {
    const l = line.trim();
    if (!l) continue;
    try {
      parsed.push(JSON.parse(l));
    } catch {
      /* skip unparseable lines */
    }
  }
  return parsed;
}

/* ------------------------------------------------------------------ */
/* meta-tag fallback (og: / twitter: / JSON-LD)                        */
/* ------------------------------------------------------------------ */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Direct-media extensions we accept from og:video/audio/twitter:stream. */
const MEDIA_EXT_RE = /\.(mp4|webm|mov|m4v|m4a|mp3|ogg|oga|wav|aac|flac|opus)(\?|$)/i;

/** Hosts whose og:video values are player embeds, not direct media. */
const PLAYER_HOST_RE =
  /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|twitch\.tv|facebook\.com|fb\.watch|instagram\.com|tiktok\.com|soundcloud\.com|spotify\.com|music\.apple\.com|apple\.com|twitter\.com|x\.com|threads\.net|pinterest\.com|reddit\.com|bilibili\.com|ok\.ru|vk\.com|rumble\.com|linkedin\.com|tumblr\.com)$/i;

const PLACEHOLDER_IMAGE_RE =
  /abs\.twimg\.com\/rweb\/ssr\/default|static\.licdn\.com\/sc\/ds\/common\/u\/images|facebook\.com\/images\/fb-icon|default-og-image|profile\-images\./i;

/** Normalized media found via page meta tags. */
export interface FallbackMedia {
  kind: "video" | "image";
  url: string;
  ext: string;
  title: string;
  siteName?: string;
  description?: string;
  thumbnail?: string;
  images: string[]; // additional og:image candidates (carousel slides)
  videoUrl?: string;
}

function isDirectMediaUrl(u: string): boolean {
  if (!u.startsWith("http")) return false;
  if (MEDIA_EXT_RE.test(u)) return true;
  let host = "";
  try {
    host = new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return false; // malformed URL - skip, don't abort the whole fallback
  }
  if (PLAYER_HOST_RE.test(host)) return false;
  // Generic hosts: accept og:video pointing at a playable file (e.g. "media", "cdn").
  return /(\.mp4|\.webm|\.mov|\.m4v|\.m4a|\.mp3|videoplayback|googlevideo)/i.test(u);
}

function isHlsUrl(u: string): boolean {
  return /\.m3u8(\?|$)/i.test(u);
}

function cleanHttpUrl(u: string): string {
  return u.replace(/&amp;/g, "&").trim();
}

/** Fetch a page's HTML with a browser-like UA, or null on failure. */
async function fetchPageHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Parse page HTML for direct media: og:video, twitter:player:stream,
 * og:audio, JSON-LD VideoObject/ImageObject, and og:image candidates.
 * Returns null when nothing usable is found.
 */
export async function extractFallbackMedia(url: string): Promise<FallbackMedia | null> {
  const html = await fetchPageHtml(url);
  if (!html) return null;

  const meta = (prop: string): string => {
    const m = html.match(
      new RegExp(`<meta\\s+(?:property|name)=["']${prop}["']\\s+content=["']([^"']+)["']`, "i")
    );
    return m?.[1] ? cleanHttpUrl(m[1]) : "";
  };

  const title = meta("og:title") || meta("twitter:title");
  const siteName = meta("og:site_name");
  const description = meta("og:description") || meta("twitter:description");

  // --- direct video candidates ---
  const videoCandidates = [
    meta("og:video:secure_url"),
    meta("og:video:url"),
    meta("og:video"),
    meta("twitter:player:stream"),
  ].filter((u) => u && u.startsWith("http") && !isHlsUrl(u));

  // JSON-LD VideoObject / MusicRecording (audio) / ImageObject.
  const ldUrls: { url: string; type: string }[] = [];
  const ldBlocks = html.match(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of ldBlocks) {
    const raw = block.replace(/<\/?script[^>]*>/gi, "").trim();
    for (const item of extractJsonLdItems(raw)) {
      const type = String(item["@type"] ?? "").toLowerCase();
      if (type.includes("videoobject")) {
        const u = cleanHttpUrl(item.contentUrl || item.url || "");
        if (u.startsWith("http")) ldUrls.push({ url: u, type: "video" });
      } else if (type.includes("musicrecording") || type.includes("audionode") || type.includes("audioobject")) {
        const u = cleanHttpUrl(item.contentUrl || item.url || "");
        if (u.startsWith("http")) ldUrls.push({ url: u, type: "audio" });
      } else if (type.includes("imageobject")) {
        const u = cleanHttpUrl(item.contentUrl || item.url || "");
        if (u.startsWith("http")) ldUrls.push({ url: u, type: "image" });
      }
    }
  }

  for (const cand of videoCandidates) {
    if (!isDirectMediaUrl(cand)) continue;
    const ext = (cand.match(MEDIA_EXT_RE)?.[1] ?? "mp4").toLowerCase();
    const thumb = meta("og:image") || meta("twitter:image");
    const images = collectImages(html);
    return {
      kind: "video",
      url: cand,
      ext,
      title: title || siteName || "Video",
      siteName: siteName || undefined,
      description: description || undefined,
      thumbnail: thumb || undefined,
      images,
      videoUrl: cand,
    };
  }

  // JSON-LD video/audio with a direct media URL.
  const ldVideo = ldUrls.find((u) => u.type === "video" && isDirectMediaUrl(u.url));
  if (ldVideo) {
    const thumb = meta("og:image") || meta("twitter:image");
    const images = collectImages(html);
    return {
      kind: "video",
      url: ldVideo.url,
      ext: (ldVideo.url.match(MEDIA_EXT_RE)?.[1] ?? "mp4").toLowerCase(),
      title: title || siteName || "Video",
      siteName: siteName || undefined,
      description: description || undefined,
      thumbnail: thumb || undefined,
      images,
      videoUrl: ldVideo.url,
    };
  }

  // --- images ---
  const images = collectImages(html);
  if (images.length > 0) {
    const imgUrl = images[0];
    const ext = (imgUrl.match(IMAGE_EXT_RE)?.[1] ?? "jpg").toLowerCase();
    return {
      kind: "image",
      url: imgUrl,
      ext,
      title: title || siteName || "Image",
      siteName: siteName || undefined,
      description: description || undefined,
      thumbnail: imgUrl,
      images: images.slice(1),
    };
  }

  return null;
}

/** Extract og:image / twitter:image / twitter:imageN candidates, deduped. */
function collectImages(html: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (u: string) => {
    const clean = cleanHttpUrl(u);
    if (clean.startsWith("http") && !PLACEHOLDER_IMAGE_RE.test(clean) && !seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
  };
  // og:image first (the primary share image), then twitter:image variants.
  const ogRe = /<meta\s+(?:property|name)=["']og:image(?::url|:secure_url)?["']\s+content=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = ogRe.exec(html)) !== null) push(m[1]);
  const twRe = /<meta\s+(?:property|name)=["']twitter:image(?::src|:\d+)?["']\s+content=["']([^"']+)["']/gi;
  while ((m = twRe.exec(html)) !== null) push(m[1]);
  return out;
}

/** Parse JSON-LD script blocks into objects (handles arrays + @graph). */
function extractJsonLdItems(raw: string): any[] {
  const items: any[] = [];
  try {
    const data = JSON.parse(raw);
    const visit = (node: any) => {
      if (Array.isArray(node)) {
        node.forEach(visit);
      } else if (node && typeof node === "object") {
        if (Array.isArray(node["@graph"])) node["@graph"].forEach(visit);
        if (node["@type"]) items.push(node);
        // Nested objects can also carry @type (e.g. mainEntity).
        for (const v of Object.values(node)) visit(v);
      }
    };
    visit(data);
  } catch {
    /* invalid JSON-LD - ignore */
  }
  return items;
}

/** Map a FallbackMedia into a RawExtract for the analyze pipeline. */
async function tryMetaFallback(url: string): Promise<RawExtract | null> {
  const fb = await extractFallbackMedia(url);
  if (!fb) return null;

  const formats: RawFormat[] = [
    {
      format_id: "0",
      ext: fb.ext,
      url: fb.url,
      vcodec: fb.kind === "video" ? "h264" : undefined,
      acodec: fb.kind === "video" ? "aac" : undefined,
    },
  ];

  return {
    title: fb.title,
    creator: fb.siteName || "",
    thumbnail: fb.thumbnail || "",
    formats,
    carousel:
      fb.kind === "image" && fb.images.length > 0
        ? [fb.url, ...fb.images].map((u, i) => ({
            id: `image-${i}`,
            kind: "image" as const,
            url: u,
            thumbnail: u,
          }))
        : undefined,
    uploader: fb.siteName || undefined,
    description: fb.description || undefined,
    url: fb.url,
    ext: fb.ext,
    isVideo: fb.kind === "video",
    extractor: fb.kind === "video" ? "og-video-fallback" : "og-image-fallback",
  };
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
