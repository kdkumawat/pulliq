# Pulliq

> **Download. Inspect. Clean.**

Pulliq is a premium web app to download publicly accessible images, videos, and music from social links, inspect their metadata, and save a privacy-clean copy to your device. Paste a link from a supported platform, pick a quality, optionally strip identifying metadata, and download. No dropdowns, no clutter, no surprises.

---

## What it is

Pulliq is built around three pillars:

1. **Download** - Paste any supported social link. Pulliq auto-detects the platform, fetches the media via `yt-dlp`, and offers multiple renditions (original, 1080p, 720p, 480p, MP3) plus carousel support.
2. **Inspect** - Every media response includes structured metadata (file, image, video, audio, and social groups). Each field is shown as **Present** (with value) or **Not Present**, so you always know exactly what is inside the file.
3. **Clean** - Optionally strip privacy-sensitive metadata (GPS coordinates, EXIF, camera, software, author, comments, timestamps) before download. Uses `exiftool` for video and `sharp`/`exiftool` for images.

### Supported platforms

| Platform | Supported |
| --- | --- |
| YouTube | Yes |
| YouTube Music | Yes |
| Instagram | Yes |
| TikTok | Yes |
| SoundCloud | Yes |
| X (Twitter) | Yes |
| Threads | Yes |
| Pinterest | Yes |
| Facebook | Yes |
| Reddit | Yes |
| Vimeo | Yes |
| Dailymotion | Yes |
| Spotify | Rejected (DRM-protected, friendly message) |
| Apple Music | Rejected (DRM-protected, friendly message) |

Spotify and Apple Music use DRM-protected streams that `yt-dlp` cannot fetch. Pulliq rejects them upfront with a clear, friendly error.

---

## Features

- **Automatic platform detection** - paste any link, no dropdown. Hostname matching handles `youtu.be`, `instagr.am`, `fb.watch`, `redd.it`, `dai.ly`, `pin.it`, and more.
- **Video, image, audio, and carousel support** - single posts, multi-image carousels, audio tracks, and videos all flow through one UI.
- **Multiple qualities** - Original, 1080p, 720p, 480p, and MP3 (128 kbps) where applicable.
- **In-browser preview** - real `<video>`/`<audio>` player with streaming proxy and Range/seek support.
- **Metadata inspection** - File, Image, Video, Audio, and Social groups. Every field is shown as **Present** (with value) or **Not Present**.
- **Privacy cleaning** - strip GPS, EXIF, camera, software, author, comments, and timestamps. Toggle on/off per download; defaults to clean.
- **Dark / Light / System theme** - one button cycles through all three, defaulting to system.
- **Mobile-first responsive design** - tested down to 390px viewport.
- **Premium UI** - Plus Jakarta Sans with tight tracking, Framer Motion transitions, shadcn/ui (New York style), Lucide icons.

---

## Tech stack

**Frontend**

- [Next.js 16](https://nextjs.org/) (App Router, Turbopack)
- [React 19](https://react.dev/), [TypeScript 5](https://www.typescriptlang.org/)
- [Tailwind CSS 4](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/) (New York style), [Lucide](https://lucide.dev/) icons
- [Framer Motion](https://www.framer.com/motion/) (animations)
- [Zustand](https://zustand-demo.pmnd.rs/) (client state), [TanStack Query](https://tanstack.com/query) (server state)
- [next-themes](https://github.com/pacocoursey/next-themes) (dark mode)
- [sonner](https://sonner.emilkowal.ski/) (toasts)

**Backend**

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - media extraction from supported platforms
- [ffmpeg](https://ffmpeg.org/) / [ffprobe](https://ffmpeg.org/ffprobe.html) - transcoding and metadata probing
- [exiftool-vendored](https://github.com/SimonHeimes/exiftool-vendored) - bundles the `exiftool` binary, used for video metadata stripping and image/file EXIF
- [sharp](https://sharp.pixelplumbing.com/) - image processing and metadata stripping

---

## Prerequisites

- **Node.js 18+** (tested on Node 24)
- **Bun** - package manager and runtime
- **yt-dlp** binary - for media extraction
- **ffmpeg + ffprobe** - for transcoding and metadata
- **exiftool** - bundled via the `exiftool-vendored` npm package (no system install needed)

---

## Getting started

```bash
# Install dependencies
bun install

# Start dev server (port 3000)
bun run dev

# Lint
bun run lint

# Build for production
bun run build

# Start production server
bun run start
```

The dev server pipes output to `dev.log` for diagnostics. The production server uses the Next.js standalone build at `.next/standalone/server.js`.

For Docker deployment, see **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

---

## Environment variables

Copy `.env.example` to `.env` for local overrides. No environment variables are required for the core media flow when `yt-dlp` and `ffmpeg` are on `$PATH`.

---

## Project structure

```
pulliq/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx            # The single user-visible route (/)
│   │   ├── layout.tsx          # Root layout, fonts, ThemeProvider
│   │   ├── icon.svg            # Favicon (Pulliq brand mark)
│   │   ├── globals.css         # Tailwind v4 + Pulliq palette
│   │   └── api/
│   │       ├── analyze/        # POST /api/analyze - extract media info
│   │       ├── download/       # POST /api/download - stream file
│   │       ├── metadata/       # POST /api/metadata - detailed file metadata
│   │       └── stream/         # GET  /api/stream - proxy media for playback
│   ├── components/
│   │   ├── pulliq/             # Pulliq-specific UI components
│   │   └── ui/                 # shadcn/ui primitives
│   ├── lib/
│   │   ├── media/
│   │   │   ├── types.ts        # Shared API contract (AnalyzeResponse, etc.)
│   │   │   ├── platform.ts     # Platform list + detection
│   │   │   ├── extract.ts      # yt-dlp wrapper
│   │   │   ├── metadata.ts     # Metadata builders (file/image/video/audio/social)
│   │   │   ├── clean.ts        # Privacy stripping (sharp + exiftool)
│   │   │   ├── paths.ts        # Binary paths + temp dir (env-configurable)
│   │   │   └── ssrf.ts         # SSRF guard (blocks private/loopback hosts)
│   │   ├── format.ts           # Formatting helpers
│   │   └── utils.ts            # cn() and misc utilities
│   ├── store/                  # Zustand stores (view, url, result, ...)
│   └── hooks/                  # React hooks (use-analyze, use-download, ...)
├── public/                     # Static assets (logo.svg, robots.txt)
├── Dockerfile                  # Production container (yt-dlp + ffmpeg included)
├── render.yaml                 # Render.com Blueprint (free tier)
├── fly.toml                    # Fly.io config
├── Caddyfile                   # Gateway config (reverse proxy to port 3000)
├── package.json
└── README.md
```

---

## API reference

All routes run on the Node.js runtime (`export const runtime = "nodejs"`) because they spawn `yt-dlp`, `ffmpeg`, and `exiftool` child processes.

### `POST /api/analyze`

Analyze a media URL and return metadata plus available formats.

**Request body**

```json
{ "url": "https://www.youtube.com/watch?v=..." }
```

**Response** - `AnalyzeResponse` (200) with fields: `ok`, `platform`, `platformLabel`, `kind`, `title`, `creator`, `thumbnail`, `duration`, `width`, `height`, `filesize`, `url`, `mediaUrl`, `formats[]`, `carousel[]?`, `metadata[]`, `social`, `tookMs`.

**Errors**

- `400` - invalid URL
- `422` - extraction failed, or platform is DRM-protected (Spotify / Apple Music)
- `429` - rate limited (12 requests / minute / IP)

### `POST /api/download`

Download a chosen rendition, optionally cleaned. Streams the file back with `Content-Disposition: attachment`.

**Request body**

```json
{ "url": "https://...", "format": "mp4-1080", "clean": true }
```

**Format IDs**

| ID | Description |
| --- | --- |
| `original` | Best source rendition (image, audio, or video) |
| `mp4-1080` | Transcoded 1080p H.264 MP4 |
| `mp4-720` | Transcoded 720p H.264 MP4 |
| `mp4-480` | Transcoded 480p H.264 MP4 |
| `mp3-128` | 128 kbps MP3 (audio extraction) |

**Response** - binary stream with `Content-Type` and `Content-Disposition` headers.

### `POST /api/metadata`

Returns detailed metadata from a freshly downloaded file (not the URL-level metadata from `/analyze`).

**Request body**

```json
{ "url": "https://..." }
```

**Response** - `MetadataResponse` with `groups[]` and `privacyRemovable[]` (field keys that can be stripped).

### `GET /api/stream?u=<encoded-url>`

Proxies a remote media URL back to the browser so that `<video>` and `<audio>` elements can play it without CORS issues, with `Range` (seek) support. The source URL is SSRF-validated before fetching.

**Query parameters**

| Name | Description |
| --- | --- |
| `u` | Direct media URL (URL-encoded) |

**Response** - proxied media stream with appropriate `Content-Type`, `Content-Length`, and `Content-Range` headers when the client requests a byte range.

---

## Deployment

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for full deployment instructions including Docker, Render, Fly.io, and why Vercel/Cloudflare Workers won't work.

**Key constraint**: Serverless platforms (Vercel, Cloudflare Workers) cannot spawn child processes (`yt-dlp`, `ffmpeg`, `exiftool`). Use a container host instead.

---

## Info for AI agents

See **[AGENTS.md](./AGENTS.md)** for the complete guide for AI agents working on this codebase.

Quick rules: single route (`/`), shared contract in `src/lib/media/types.ts`, English comments only, no em dashes, use `best` format (not `bv*+ba/b`), use exiftool (not ffmpeg) for video metadata stripping.

---

## Legal / Liability

> **Disclaimer & Limitation of Liability**
>
> Pulliq is provided "as is" for downloading publicly accessible media from supported platforms. Users are solely responsible for ensuring they have the legal right to download, use, and distribute any content accessed through this service.
>
> Pulliq does not host, store, or claim ownership of any media. All content remains the property of its respective owners. The platform, its creators, and contributors are **not responsible** for any misuse, copyright infringement, or violation of applicable laws or platform terms of service committed by users.
>
> By using Pulliq, you agree that:
> - You will only download publicly accessible content you have the right to access.
> - You will respect copyright laws, platform terms of service, and applicable regulations in your jurisdiction.
> - The platform and its operators are not liable for any damages, legal action, or consequences arising from your use of the service.
>
> If you believe your copyright has been infringed, please contact the respective hosting platform directly.

This text is also surfaced in the in-app Terms dialog.

---

## License

MIT. See `LICENSE` for details if present; otherwise the project is proprietary/unspecified.
