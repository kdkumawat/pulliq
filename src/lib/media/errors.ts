import type { PlatformId } from "./types";

/** Turn a raw error into a clear, honest, user-facing message. */
export function friendlyMediaError(msg: string, platform: PlatformId | string): string {
  const lower = msg.toLowerCase();
  const platName = capitalize(platform);

  if (platform === "linkedin" || platform === "facebook") {
    return `${platName} requires login to view most content, so Pulliq can't access it. Try a public post or a different platform.`;
  }
  if (platform === "tiktok" || platform === "threads") {
    if (
      lower.includes("blocked") ||
      lower.includes("unexpected response") ||
      lower.includes("login") ||
      lower.includes("private")
    ) {
      return `${platName} blocked automated access to this link. Try copying the share link again or use a different platform.`;
    }
  }
  if (lower.includes("timed out")) {
    return "This link took too long to respond. Please try again in a moment.";
  }
  if (
    lower.includes("private") ||
    lower.includes("login") ||
    lower.includes("sign in") ||
    lower.includes("unauthorized")
  ) {
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

export function friendlyDownloadError(msg: string, platform: PlatformId | string): string {
  const base = friendlyMediaError(msg, platform);
  if (base.includes("couldn't access")) {
    return base.replace(
      "Pulliq couldn't access this link.",
      "This media could not be downloaded."
    );
  }
  return base;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
