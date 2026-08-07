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
