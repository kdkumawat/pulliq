import type { PlatformId, PlatformInfo } from "./types";

export const PLATFORMS: PlatformInfo[] = [
  { id: "youtube", name: "YouTube", slug: "youtube-downloader", color: "#FF0000", domain: "youtube.com" },
  { id: "youtube-music", name: "YT Music", slug: "youtube-music-downloader", color: "#FF0000", domain: "music.youtube.com" },
  { id: "instagram", name: "Instagram", slug: "instagram-downloader", color: "#E1306C", domain: "instagram.com" },
  { id: "tiktok", name: "TikTok", slug: "tiktok-downloader", color: "#FE2C55", domain: "tiktok.com" },
  { id: "soundcloud", name: "SoundCloud", slug: "soundcloud-downloader", color: "#FF5500", domain: "soundcloud.com" },
  { id: "x", name: "X", slug: "x-video-downloader", color: "#1d1d1d", domain: "x.com" },
  { id: "threads", name: "Threads", slug: "threads-downloader", color: "#0f0f0f", domain: "threads.net" },
  { id: "linkedin", name: "LinkedIn", slug: "linkedin-downloader", color: "#0A66C2", domain: "linkedin.com" },
  { id: "pinterest", name: "Pinterest", slug: "pinterest-downloader", color: "#E60023", domain: "pinterest.com" },
  { id: "facebook", name: "Facebook", slug: "facebook-downloader", color: "#1877F2", domain: "facebook.com" },
  { id: "reddit", name: "Reddit", slug: "reddit-downloader", color: "#FF4500", domain: "reddit.com" },
  { id: "vimeo", name: "Vimeo", slug: "vimeo-downloader", color: "#19B7EA", domain: "vimeo.com" },
  { id: "dailymotion", name: "Dailymotion", slug: "dailymotion-downloader", color: "#0066DC", domain: "dailymotion.com" },
  { id: "twitch", name: "Twitch", slug: "twitch-downloader", color: "#9146FF", domain: "twitch.tv" },
  { id: "vk", name: "VK", slug: "vk-video-downloader", color: "#0077FF", domain: "vk.com" },
  { id: "tumblr", name: "Tumblr", slug: "tumblr-downloader", color: "#34526F", domain: "tumblr.com" },
  { id: "bandcamp", name: "Bandcamp", slug: "bandcamp-downloader", color: "#629AA9", domain: "bandcamp.com" },
  { id: "rumble", name: "Rumble", slug: "rumble-video-downloader", color: "#85C742", domain: "rumble.com" },
];

/** Platforms that yt-dlp cannot fetch (DRM-protected or unsupported). */
export const UNSUPPORTED_PLATFORMS = new Set<PlatformId>(["spotify", "apple-music"]);

const HOST_MAP: Record<string, PlatformId> = {
  "youtube.com": "youtube",
  "youtu.be": "youtube",
  "music.youtube.com": "youtube-music",
  "instagram.com": "instagram",
  "instagr.am": "instagram",
  "tiktok.com": "tiktok",
  "soundcloud.com": "soundcloud",
  "on.soundcloud.com": "soundcloud",
  "x.com": "x",
  "twitter.com": "x",
  "threads.net": "threads",
  "linkedin.com": "linkedin",
  "lnkd.in": "linkedin",
  "pinterest.com": "pinterest",
  "pin.it": "pinterest",
  "facebook.com": "facebook",
  "fb.watch": "facebook",
  "reddit.com": "reddit",
  "redd.it": "reddit",
  "vimeo.com": "vimeo",
  "dailymotion.com": "dailymotion",
  "dai.ly": "dailymotion",
  "twitch.tv": "twitch",
  "vk.com": "vk",
  "vk.cc": "vk",
  "tumblr.com": "tumblr",
  "bandcamp.com": "bandcamp",
  "rumble.com": "rumble",
  "open.spotify.com": "spotify",
  "spotify.com": "spotify",
  "music.apple.com": "apple-music",
};

export function detectPlatform(rawUrl: string): PlatformId {
  try {
    const u = new URL(normalizeUrl(rawUrl));
    let host = u.hostname.replace(/^www\./, "").toLowerCase();
    // music.youtube.com is a subdomain of youtube.com; check exact host first.
    for (const [domain, id] of Object.entries(HOST_MAP)) {
      if (host === domain || host.endsWith(`.${domain}`)) return id;
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

export function getPlatformInfo(id: PlatformId): PlatformInfo | undefined {
  return PLATFORMS.find((p) => p.id === id);
}

/**
 * Detect the platform, following HTTP redirects when the host is unknown.
 * Handles shorteners (t.co, lnkd.in, etc.) and link wrappers so the correct
 * platform is reported and the right extractor strategy is used.
 */
export async function detectPlatformWithRedirect(rawUrl: string): Promise<PlatformId> {
  const direct = detectPlatform(rawUrl);
  if (direct !== "unknown") return direct;
  try {
    const res = await fetch(normalizeUrl(rawUrl), {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
    });
    return detectPlatform(res.url || normalizeUrl(rawUrl));
  } catch {
    return "unknown";
  }
}

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function isValidHttpUrl(raw: string): boolean {
  try {
    const u = new URL(normalizeUrl(raw));
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
