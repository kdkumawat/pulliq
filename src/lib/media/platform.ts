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
