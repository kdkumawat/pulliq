#!/bin/sh
# Pulliq container entrypoint.
#
# YouTube changes its player frequently and yt-dlp must stay current. We
# best-effort update yt-dlp on every container start; if the update fails we
# keep running with the bundled version instead of crashing.
set -e

if command -v python3 >/dev/null 2>&1; then
  echo "[entrypoint] updating yt-dlp to latest (best-effort)..."
  python3 -m pip install --break-system-packages --no-cache-dir -q -U "yt-dlp[default]" \
    || echo "[entrypoint] warning: yt-dlp update failed, continuing with bundled version" >&2
fi

exec node server.js
