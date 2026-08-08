/** In-memory counters (reset on deploy/restart). Complement GA for quick server-side totals. */
const stats = {
  analyzes: 0,
  downloads: 0,
  keepAlivePings: 0,
};

export function incrementAnalyzes() {
  stats.analyzes += 1;
}

export function incrementDownloads() {
  stats.downloads += 1;
}

export function incrementKeepAlivePings() {
  stats.keepAlivePings += 1;
}

export function getServerStats() {
  return { ...stats };
}
