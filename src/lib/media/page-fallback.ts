import type { PlatformId } from "./types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

function isInstagramHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "instagram.com" || host.endsWith(".instagram.com") || host === "instagr.am";
  } catch {
    return false;
  }
}

function instagramEmbedUrl(pageUrl: string): string | null {
  try {
    const u = new URL(pageUrl);
    if (!isInstagramHost(pageUrl)) return null;
    const m = u.pathname.match(/^\/(reel|tv|p)\/([^/]+)/i);
    if (!m) return null;
    return `https://www.instagram.com/${m[1]}/${m[2]}/embed/`;
  } catch {
    return null;
  }
}

function userAgentForUrl(url: string): string {
  return isInstagramHost(url) ? MOBILE_UA : UA;
}

const PLACEHOLDER_PATTERNS = [
  /abs\.twimg\.com\/rweb\/ssr\/default/i,
  /static\.licdn\.com\/sc\/ds\/common\/u\/images/i,
  /facebook\.com\/images\/fb-icon/i,
  /default-og-image/i,
];

export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

/** Thumbnail URLs that belong to a video post, not a still-image post. */
export function isVideoThumbnailUrl(url: string): boolean {
  return (
    /amplify_video_thumb|ext_tw_video_thumb|video_thumb/i.test(url) ||
    /(?:i\.)?ytimg\.com\/vi\//i.test(url) ||
    /img\.youtube\.com/i.test(url) ||
    /dms\.licdn\.com.*thumbnail-with-play-button/i.test(url)
  );
}

async function fetchPageHtmlOnce(
  url: string,
  userAgent: string,
  timeoutMs: number
): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": userAgent,
        accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

/** Fetch page HTML. Instagram uses a mobile UA and also loads /embed/ for video URLs. */
export async function fetchPageHtml(
  url: string,
  timeoutMs = 15_000
): Promise<string | null> {
  const ua = userAgentForUrl(url);
  const primary = await fetchPageHtmlOnce(url, ua, timeoutMs);

  if (!isInstagramHost(url)) return primary;

  const embed = instagramEmbedUrl(url);
  if (!embed) return primary;

  const embedHtml = await fetchPageHtmlOnce(embed, MOBILE_UA, timeoutMs);
  if (!embedHtml) return primary;
  if (!primary) return embedHtml;
  return `${primary}\n${embedHtml}`;
}

function decodeJsonString(s: string): string {
  let out = s;
  try {
    out = JSON.parse(`"${s}"`);
  } catch {
    out = s
      .replace(/\\u0026/g, "&")
      .replace(/\\u00253D/g, "%3D");
  }
  return out.replace(/\\\//g, "/").replace(/\\/g, "");
}

function isDirectVideoUrl(url: string): boolean {
  return (
    /\.(mp4|webm|mov|m4v)(\?|#|\/|$)/i.test(url) ||
    /\/mp4[-/]/i.test(url) ||
    /googlevideo\.com/i.test(url) ||
    /video\.twimg\.com/i.test(url) ||
    /fbcdn\.net/i.test(url) ||
    /cdninstagram\.com/i.test(url) ||
    /dms\.licdn\.com/i.test(url)
  );
}

function extractInstagramVideoUrl(html: string): string | null {
  const patterns = [
    /"video_url":"([^"]+)"/i,
    /"playback_url":"([^"]+)"/i,
    /\\"video_url\\":\\"((?:[^"\\]|\\.)*)\\"/i,
    /\\"playback_url\\":\\"((?:[^"\\]|\\.)*)\\"/i,
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (!m?.[1]) continue;
    const url = decodeJsonString(m[1]);
    if (url.startsWith("http") && isDirectVideoUrl(url)) return url;
  }
  return null;
}

/** YouTube embeds stream URLs inside ytInitialPlayerResponse. */
export function extractYoutubeStreamUrl(html: string): string | null {
  const abr = /"serverAbrStreamingUrl":"(https:\/\/[^"]+)"/.exec(html);
  if (abr?.[1]) {
    const url = decodeJsonString(abr[1]);
    if (/googlevideo\.com\/videoplayback/i.test(url)) return url;
  }

  const idx = html.indexOf("ytInitialPlayerResponse");
  if (idx < 0) return null;
  const chunk = html.slice(idx, idx + 800_000);

  const patterns = [
    /"url":"(https:\/\/[^"]+googlevideo\.com\/videoplayback[^"]+)"/g,
    /"url":"(https:\\\/\\\/[^"]+googlevideo\.com\/videoplayback[^"]+)"/g,
  ];

  for (const re of patterns) {
    const matches = [...chunk.matchAll(re)];
    if (!matches.length) continue;

    for (const m of matches) {
      const pos = m.index ?? 0;
      const ctx = chunk.slice(Math.max(0, pos - 200), pos + 400);
      if (/video\/mp4.*mp4a|itag":(?:18|22)/i.test(ctx)) {
        return decodeJsonString(m[1]);
      }
    }
    return decodeJsonString(matches[0][1]);
  }

  return null;
}

/** JSON-LD VideoObject blocks (LinkedIn and others). */
export function extractJsonLdVideoUrl(html: string): string | null {
  const scripts = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  for (const s of scripts) {
    try {
      const data = JSON.parse(s[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item?.["@type"] !== "VideoObject" && item?.["@type"]?.[0] !== "VideoObject") {
          continue;
        }
        const url = item?.contentUrl;
        if (typeof url === "string" && isDirectVideoUrl(url)) return url;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Pull a direct video URL from page markup (schema.org, JSON-LD, embedded JSON). */
export function extractEmbeddedVideoUrl(html: string): string | null {
  const yt = extractYoutubeStreamUrl(html);
  if (yt) return yt;

  const jsonLd = extractJsonLdVideoUrl(html);
  if (jsonLd) return jsonLd;

  const schemaPatterns = [
    /itemProp=["']contentUrl["']\s+content=["']([^"']+)["']/gi,
    /content=["']([^"']+)["'][^>]*itemProp=["']contentUrl["']/gi,
  ];
  for (const re of schemaPatterns) {
    let m;
    while ((m = re.exec(html)) !== null) {
      const url = m[1];
      if (url.startsWith("http") && isDirectVideoUrl(url)) return url;
    }
  }

  const mp4 =
    /https:\/\/video\.twimg\.com\/[^"'\s<>]+\.mp4[^"'\s<>]*/i.exec(html) ||
    /https:\/\/dms\.licdn\.com\/[^"'\s<>]*\/mp4[^"'\s<>]*/i.exec(html) ||
    /https:\/\/[^"'\s<>]*\.mp4[^"'\s<>]*/i.exec(html);
  if (mp4?.[0] && isDirectVideoUrl(mp4[0])) {
    return decodeHtmlEntities(mp4[0]);
  }

  const ig = extractInstagramVideoUrl(html);
  if (ig) return ig;

  return null;
}

export function extractOgVideoUrl(html: string): string | null {
  const ogVideoMatch =
    /<meta\s+property=["']og:video(?::url)?["']\s+content=["']([^"']+)["']/i.exec(html);
  const ogVideoSecureMatch =
    /<meta\s+property=["']og:video:secure_url["']\s+content=["']([^"']+)["']/i.exec(html);
  const videoUrl = ogVideoSecureMatch?.[1] || ogVideoMatch?.[1];
  if (videoUrl && videoUrl.startsWith("http") && isDirectVideoUrl(videoUrl)) {
    return videoUrl;
  }
  return null;
}

export function extractDirectVideoUrl(html: string): string | null {
  return extractEmbeddedVideoUrl(html) || extractOgVideoUrl(html);
}

export function extractOgImageUrl(html: string): string | null {
  const imgRegex =
    /<meta\s+(?:property|name)=["'](?:og:image|twitter:image)(?::url)?["']\s+content=["']([^"']+)["']/gi;
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    const imgUrl = match[1].trim();
    if (
      imgUrl &&
      imgUrl.startsWith("http") &&
      !PLACEHOLDER_PATTERNS.some((p) => p.test(imgUrl))
    ) {
      return imgUrl;
    }
  }
  return null;
}

export function parsePageTitle(html: string): string {
  const titleMatch =
    /<meta\s+property=["']og:title["']\s+content=["']([^"']*)["']/i.exec(html);
  const siteMatch =
    /<meta\s+property=["']og:site_name["']\s+content=["']([^"']*)["']/i.exec(html);
  return decodeHtmlEntities(titleMatch?.[1] || siteMatch?.[1] || "Media");
}

export function parsePageDescription(html: string): string | undefined {
  const descMatch =
    /<meta\s+property=["']og:description["']\s+content=["']([^"']*)["']/i.exec(html);
  return descMatch?.[1] ? decodeHtmlEntities(descMatch[1]) : undefined;
}

export function parseSchemaVideoMeta(html: string): {
  width?: number;
  height?: number;
  duration?: number;
} {
  const height = Number(
    /itemProp=["']height["']\s+content=["'](\d+)["']/i.exec(html)?.[1] ??
      /<meta\s+property=["']og:video:height["']\s+content=["'](\d+)["']/i.exec(html)?.[1] ??
      0
  );
  const width = Number(
    /itemProp=["']width["']\s+content=["'](\d+)["']/i.exec(html)?.[1] ??
      /<meta\s+property=["']og:video:width["']\s+content=["'](\d+)["']/i.exec(html)?.[1] ??
      0
  );
  const durRaw =
    /itemProp=["']duration["']\s+content=["']([^"']+)["']/i.exec(html)?.[1] ?? "";
  let duration: number | undefined;
  const iso = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(durRaw);
  if (iso) {
    duration =
      Number(iso[1] || 0) * 3600 +
      Number(iso[2] || 0) * 60 +
      Number(iso[3] || 0);
  }
  return {
    width: width > 0 ? width : undefined,
    height: height > 0 ? height : undefined,
    duration: duration && duration > 0 ? duration : undefined,
  };
}

export function parseDimensionsFromVideoUrl(url: string): {
  width?: number;
  height?: number;
} {
  const m = /\/(\d{2,4})x(\d{2,4})\//.exec(url);
  if (!m) return {};
  const width = Number(m[1]);
  const height = Number(m[2]);
  if (!width || !height) return {};
  return { width, height };
}

/** Guess file extension from a direct media URL. */
export function extFromMediaUrl(url: string): string {
  const dotted = url.match(/\.(mp4|webm|mov|m4v|jpg|jpeg|png|webp|gif)(\?|#|$)/i)?.[1];
  if (dotted) return dotted.toLowerCase();
  if (/\/mp4[-/]/i.test(url)) return "mp4";
  return "mp4";
}

/** Whether a URL from analyze can be fetched directly (not YouTube CDN tokens). */
export function isDirectDownloadUrl(
  mediaUrl: string,
  platform: PlatformId
): boolean {
  if (!mediaUrl.startsWith("http")) return false;
  if (platform === "youtube" || platform === "youtube-music") return false;
  if (/googlevideo\.com/i.test(mediaUrl)) return false;
  return (
    /\.(mp4|webm|mov|m4v|jpg|jpeg|png|webp|gif)(\?|#|$)/i.test(mediaUrl) ||
    /\/mp4[-/]/i.test(mediaUrl) ||
    /dms\.licdn\.com/i.test(mediaUrl) ||
    /video\.twimg\.com/i.test(mediaUrl) ||
    /cdninstagram\.com/i.test(mediaUrl) ||
    /fbcdn\.net/i.test(mediaUrl)
  );
}

export async function downloadRemoteFile(
  mediaUrl: string,
  destPath: string,
  referer?: string,
  timeoutMs = 90_000
): Promise<void> {
  const res = await fetch(mediaUrl, {
    headers: {
      "user-agent": referer ? userAgentForUrl(referer) : UA,
      accept: "*/*",
      ...(referer ? { referer } : {}),
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`Failed to download media (${res.status})`);
  }
  if (res.body) {
    const { createWriteStream } = await import("node:fs");
    const { pipeline } = await import("node:stream/promises");
    await pipeline(res.body as NodeJS.ReadableStream, createWriteStream(destPath));
    return;
  }
  const { writeFile } = await import("node:fs/promises");
  await writeFile(destPath, Buffer.from(await res.arrayBuffer()));
}

export type PageMedia =
  | {
      kind: "video";
      url: string;
      title: string;
      width?: number;
      height?: number;
      duration?: number;
    }
  | { kind: "image"; url: string; title: string; ext: string };

/** Resolve downloadable media from page HTML when yt-dlp is unavailable. */
export function resolvePageMedia(html: string, _pageUrl: string): PageMedia | null {
  const title = parsePageTitle(html);
  const schema = parseSchemaVideoMeta(html);

  const videoUrl = extractDirectVideoUrl(html);
  if (videoUrl) {
    const urlDims = parseDimensionsFromVideoUrl(videoUrl);
    return {
      kind: "video",
      url: videoUrl,
      title,
      width: schema.width || urlDims.width,
      height: schema.height || urlDims.height,
      duration: schema.duration,
    };
  }

  const imgUrl = extractOgImageUrl(html);
  if (imgUrl && !isVideoThumbnailUrl(imgUrl)) {
    const ext = imgUrl.match(/\.(jpg|jpeg|png|webp|gif)/i)?.[1]?.toLowerCase() || "jpg";
    return { kind: "image", url: imgUrl, title, ext };
  }

  return null;
}

export async function resolvePageMediaFromUrl(
  pageUrl: string
): Promise<PageMedia | null> {
  const html = await fetchPageHtml(pageUrl);
  if (!html) return null;
  return resolvePageMedia(html, pageUrl);
}
