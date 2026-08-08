# Deployment Guide

This document covers how to deploy Pulliq to production.

## Can I use Vercel?

**No - not for the full app.** Vercel serverless functions cannot run Pulliq's media pipeline:

| Requirement | Vercel | Pulliq needs |
|-------------|--------|--------------|
| Spawn child processes (`yt-dlp`, `ffmpeg`, `exiftool`) | Not supported | Required |
| Long-running downloads (up to 90s+) | 10s hobby / 60s pro timeout | Up to 180s transcode |
| Persistent temp files | Ephemeral `/tmp` only | Temp download dir |
| Custom binaries on PATH | Not available | `yt-dlp` + `ffmpeg` |

You could deploy **only the static frontend** to Vercel and run the API elsewhere, but that requires splitting the app and is not set up out of the box.

## Free / low-cost hosting options

| Platform | Free tier | Best for | Notes |
|----------|-----------|----------|-------|
| **Render** | Yes (spins down after 15 min idle) | Easiest Docker deploy | Use included `render.yaml` |
| **Fly.io** | ~3 shared VMs, 160 GB egress/mo | Always-on with cold start | Use included `fly.toml` |
| **Railway** | $5 trial credits/month | Quick setup | Connect repo, set Dockerfile |
| **Oracle Cloud Always Free** | 2 ARM VMs forever | Full control | Install Docker, run `docker build` |
| **Hetzner CX22** | ~EUR 4/mo (not free) | Reliable production | Best price/performance |
| **Vercel** | Free frontend only | Static sites | **Cannot** run media API |
| **Cloudflare Pages/Workers** | Free | Edge CDN | **Cannot** spawn child processes |

**Recommended for free:** Render (simplest) or Fly.io (more control).

### Keep-alive (Render free tier)

Render spins down after **15 minutes** without **inbound** traffic.

#### Built-in self-ping (enabled on Render automatically)

The app pings its own public URL every **10 minutes** while the Node process is running (`src/lib/keep-alive.ts` + `src/instrumentation.ts`). Render sets `RENDER_EXTERNAL_URL`; no GitHub cron required.

- Endpoint: `GET /api/health` (lightweight, includes server stats)
- Disable: set env `KEEP_ALIVE=false`
- **Limitation:** Cannot wake a spun-down instance. Something must hit the site first (you, a user, or deploy); then self-ping keeps it warm.

Check stats: `curl https://pulliq.onrender.com/api/health`

```json
{
  "ok": true,
  "service": "pulliq",
  "uptimeSec": 3600,
  "analytics": {
    "enabled": true,
    "source": "GA_MEASUREMENT_ID",
    "measurementIdHint": "…43BG"
  },
  "stats": { "analyzes": 12, "downloads": 3, "keepAlivePings": 6 }
}
```

If `analytics.enabled` is `false`, set `GA_MEASUREMENT_ID` on Render and redeploy.

#### External backup (optional)

UptimeRobot or cron-job.org pinging `/api/health` every 5 min can wake the app after spin-down. GitHub Actions cron is unreliable (often 45-90+ min gaps).

**Trade-off:** A warm instance uses your **750 free instance hours/month** (~720 h if always on).

### Analytics (Google Analytics 4)

#### Setup steps

1. Go to [analytics.google.com](https://analytics.google.com) and create an account (if needed).
2. **Admin** (gear) → **Create property** → name it `Pulliq`, set timezone/currency.
3. Choose **Web** stream → URL: `https://pulliq.onrender.com` (or your domain).
4. Copy the **Measurement ID** (format `G-XXXXXXXXXX`).
5. In **Render Dashboard** → your service → **Environment** → add (either works; prefer both):
   - `GA_MEASUREMENT_ID` = `G-XXXXXXXXXX` (read at **runtime** - required for Docker)
   - `NEXT_PUBLIC_GA_MEASUREMENT_ID` = `G-XXXXXXXXXX` (optional, used at build time)
6. **Manual Deploy** → **Clear build cache & deploy** (needed after first GA setup).

#### What you can see in GA4

| Metric | GA event | Where in GA4 |
|--------|----------|----------------|
| Page / screen views | `screen_view` (landing vs analyze) | Reports → Engagement → Pages and screens |
| Analyze started | `analyze_start` | Reports → Engagement → Events |
| Analyze succeeded | `analyze_success` (platform, media kind) | Events → click event → add `platform` dimension |
| Analyze failed | `analyze_error` | Events |
| Download started | `download_start` (format, clean copy) | Events |
| Download succeeded | `download_success` | Events |
| Download failed | `download_error` | Events |

**Mark key events:** Admin → Data display → Events → toggle **download_success** and **analyze_success** as conversions.

**Real-time test:** Reports → Realtime while you use the site after adding the Measurement ID.

#### Server-side counters (bonus)

`GET /api/health` returns in-memory `analyzes` and `downloads` counts (reset on redeploy). Useful for quick checks; GA4 is the source of truth for traffic.

## Prerequisites

The app requires these system binaries at runtime:

| Binary | Install | Used for |
|--------|---------|----------|
| `yt-dlp` | `pip install yt-dlp` or system package | Media extraction |
| `ffmpeg` / `ffprobe` | System package | Transcoding, metadata |
| `exiftool` | Bundled via `exiftool-vendored` npm package | Metadata stripping |
| `sharp` | npm package (installed automatically) | Image processing |

The included `Dockerfile` installs `ffmpeg` and `yt-dlp` automatically.

## Quick deploy with Docker

```bash
# Build
docker build -t pulliq .

# Run locally
docker run -p 3000:3000 pulliq

# Health check
curl http://localhost:3000/api/analyze
```

## Deploy to Render (free)

1. Push this repo to GitHub.
2. In [Render](https://render.com), create a **New Blueprint** and connect the repo.
3. Render reads `render.yaml` and builds from the `Dockerfile`.
4. First deploy takes ~5-10 minutes (Docker build + Next.js compile).

Free tier spins down after inactivity; first request after idle may take 30-60 seconds.

## Deploy to Fly.io (free allowance)

```bash
# Install flyctl: https://fly.io/docs/hands-on/install-flyctl/
fly launch    # first time - pick a region near your users
fly deploy
fly open
```

Edit `fly.toml` and change `app = "pulliq"` to a unique name before launching.

## Deploy to Railway

1. Connect GitHub repo at [railway.app](https://railway.app).
2. Set builder to **Dockerfile**.
3. Expose port **3000**.
4. No env vars required for the core media flow.

## Manual VPS deploy

```bash
# Install dependencies (Ubuntu/Debian)
sudo apt update && sudo apt install -y ffmpeg python3-pip
pip install yt-dlp

# Install Bun: https://bun.sh
bun install
bun run build
PORT=3000 bun run start
```

Put Caddy or nginx in front for HTTPS. The repo includes a `Caddyfile` for reverse-proxying port 3000.

## Environment variables

Copy `.env.example` to `.env` for local overrides. None are required if binaries are on `$PATH`.

| Variable | Default | Description |
|----------|---------|-------------|
| `YT_DLP_PATH` | `yt-dlp` | Path to yt-dlp binary |
| `FFMPEG_PATH` | `ffmpeg` | Path to ffmpeg |
| `FFPROBE_PATH` | `ffprobe` | Path to ffprobe |
| `EXIFTOOL_PATH` | `node_modules/exiftool-vendored.pl/bin/exiftool` | Path to exiftool |
| `TMP_DIR` | OS temp dir + `/pulliq` | Temp download directory |
| `PORT` | `3000` | HTTP port |

## Memory considerations

Media processing is memory-intensive. Recommend **at least 1 GB RAM**:

- Use `best` format for original downloads (not `bv*+ba/b`, which merges streams and can OOM).
- Use `exiftool` (not `ffmpeg`) for video metadata stripping.
- Limit concurrent downloads on small instances.

## Health check

```bash
curl -s https://your-domain.com/api/analyze
# Returns: {"ok":true,"endpoint":"POST /api/analyze",...}
```

## Cloudflare CDN (optional)

Put Cloudflare in front of any Node.js host for DDoS protection and edge caching of static assets. Do **not** run the API on Cloudflare Workers - they cannot spawn child processes.
