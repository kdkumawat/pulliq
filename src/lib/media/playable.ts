/** Build a proxied stream URL with optional source-page referer. */
export function buildStreamUrl(mediaUrl: string, pageUrl?: string): string {
  const params = new URLSearchParams({ u: mediaUrl });
  if (pageUrl) params.set("ref", pageUrl);
  return `/api/stream?${params.toString()}`;
}
