/**
 * Self-ping keep-alive for Render free tier (15 min idle spin-down).
 *
 * Only runs while the Node process is up. After a cold start, the first visitor
 * or deploy wakes the app; then pings every 10 min keep it warm.
 *
 * Disable with KEEP_ALIVE=false
 */
const INTERVAL_MS = 10 * 60 * 1000;
const START_DELAY_MS = 60_000;

export function startKeepAlive(): void {
  if (process.env.KEEP_ALIVE === "false") return;
  if (process.env.NODE_ENV !== "production") return;

  const base =
    process.env.KEEP_ALIVE_URL ??
    process.env.RENDER_EXTERNAL_URL ??
    process.env.NEXT_PUBLIC_SITE_URL;

  if (!base) {
    console.warn(
      "[keep-alive] skipped: set RENDER_EXTERNAL_URL or KEEP_ALIVE_URL"
    );
    return;
  }

  const url = `${base.replace(/\/$/, "")}/api/health`;

  const ping = async () => {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(25_000),
        headers: { "User-Agent": "pulliq-keep-alive/1" },
      });
      if (!res.ok) {
        console.warn(`[keep-alive] ping HTTP ${res.status}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[keep-alive] ping failed: ${msg}`);
    }
  };

  console.info(`[keep-alive] enabled, target ${url} every ${INTERVAL_MS / 60000}m`);

  setTimeout(() => {
    ping();
    const timer = setInterval(ping, INTERVAL_MS);
    if (typeof timer === "object" && "unref" in timer) {
      timer.unref();
    }
  }, START_DELAY_MS);
}
