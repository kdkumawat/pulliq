# AGENTS.md - Info for AI Agents

This document is addressed to AI agents (LLMs, coding assistants, autonomous coding tools) that may work on this codebase. Read it before making any changes.

## Architecture rules (non-negotiable)

1. **Single user-visible route (`/`)**. All "pages" are view states on `/` orchestrated via the Zustand store (`src/store/pulliq-store.ts`). Fields: `view`, `url`, `result`, `analyzing`, `error`, `startAnalyze`. Do NOT add new routes. The only other Next.js routes are API handlers under `src/app/api/` and metadata routes (`robots.ts`, `sitemap.ts`).

2. **Shared API contract**: `src/lib/media/types.ts` defines `AnalyzeResponse`, `MediaFormat`, `MetaGroup`, `MetaField`, `CarouselItem`, `PlatformId`, `MediaKind`, `DownloadRequest`, `MetadataResponse`. Read it before changing any API.

3. **Platform detection**: `src/lib/media/platform.ts` contains `PLATFORMS` (the ordered list shown in the UI) and `HOST_MAP` (domain-to-platform-id mapping). Add new platforms in BOTH. Also add the platform id to the `PlatformId` union type in `types.ts`, and add the brand SVG icon + color in `src/components/pulliq/platform-icon.tsx`.

4. **No unused auth or data packages**. All media processing is done via `yt-dlp`, `ffmpeg`, `ffprobe`, `exiftool`, and `sharp` (system binaries + npm packages).

5. **API route handlers only**. Use `export async function POST(req: Request)` / `export async function GET(req: Request)`. Do NOT use server actions.

## Backend binaries

| Binary | Location | Purpose |
|--------|----------|---------|
| `yt-dlp` | `/home/z/.venv/bin/yt-dlp` | Media extraction (metadata, formats, download) |
| `ffmpeg` | `/usr/bin/ffmpeg` | Video transcoding, MP3 extraction |
| `ffprobe` | `/usr/bin/ffprobe` | Video/audio metadata |
| `exiftool` | `node_modules/exiftool-vendored.pl/bin/exiftool` | Metadata stripping (clean copy) |
| `sharp` | npm package | Image processing |

## Media extraction flow

1. `POST /api/analyze` receives `{url}`, validates URL + SSRF, calls `extractMedia(url)`.
2. `extractMedia` (in `src/lib/media/extract.ts`) runs `yt-dlp --dump-json` to get metadata.
3. If yt-dlp fails (e.g. Twitter image posts), it falls back to `tryImageFallback(url)` which fetches the page HTML and extracts `og:image` meta tags. This handles image-only posts on X, Pinterest, and other platforms.
4. The result is mapped to `RawExtract` and then to `AnalyzeResponse` with metadata groups and formats.
5. If everything fails, returns a `422` with an honest error message (no fake content).

## Download flow

1. `POST /api/download` receives `{url, format, clean}`.
2. Tries `downloadSource` (yt-dlp) first.
3. If yt-dlp fails, tries `downloadDirectImage` (fetch page HTML, extract og:image, download image). This handles Twitter/X image posts and other image-only links.
4. If `clean: true`, runs metadata stripping (exiftool for videos, sharp for images).
5. Streams the file to the client with `Content-Disposition` attachment header.

## Memory constraints

The dev server runs on a **4 GB** machine. Critical rules:

- Use `best` format selector for original video downloads (NOT `bv*+ba/b` which merges video+audio and can OOM).
- Use `exiftool` (not `ffmpeg`) for video metadata stripping. `exiftool -all=` rewrites only the file header; ffmpeg re-encodes the entire stream.
- Pre-warm API routes with a GET request before the first POST (avoids compile-time memory spike).
- The browser (Chrome/Chromium) + dev server + yt-dlp + ffmpeg can exhaust memory. Close the browser when running heavy backend tests.

## Platform support

| Platform | Status | Notes |
|----------|--------|-------|
| YouTube | Works | Video + MP3 extraction |
| YouTube Music | Works | Audio + MP3 |
| Instagram | Works | Video, carousel, images |
| TikTok | May be blocked | Returns honest 422 if blocked |
| SoundCloud | Works | Audio + MP3 |
| X (Twitter) | Video via yt-dlp, images via og:image fallback | |
| Threads | May be blocked | Returns honest 422 |
| LinkedIn | Via yt-dlp or og:image | Added recently |
| Pinterest | Via yt-dlp or og:image | |
| Facebook | May be blocked | Returns honest 422 |
| Reddit | Works | Video, images |
| Vimeo | Works | Video |
| Dailymotion | Works | Video |
| Spotify | Rejected (DRM) | Friendly 422 upfront |
| Apple Music | Rejected (DRM) | Friendly 422 upfront |

## Coding conventions

- **All comments must be in English**. No Chinese characters anywhere in `src/` or `.zscripts/`.
- **No em dashes (`—`)**. Use regular hyphens (`-`) instead. This is enforced; grep for `\x{2014}` returns zero results.
- **`suppressHydrationWarning`** is used on text inputs to handle browser autofill extension attributes (Google Chrome adds `__gcruniqueid`). Do NOT remove this prop.
- **SSRF protection** (`src/lib/media/ssrf.ts`) blocks localhost, loopback, private, and link-local IPs. Do NOT weaken it.
- **Rate limiting** is in-process (12 requests/minute/IP) on `/api/analyze` and `/api/metadata`. Do NOT remove it.
- **Use `cursor: pointer`** on all clickable elements. This is handled globally in `globals.css` via a base layer rule.
- **Premium fonts**: Plus Jakarta Sans for body/headings (variable: `--font-inter`), JetBrains Mono for metadata (variable: `--font-mono`). Tighter letter-spacing on headings.
- **Theme**: cycles light -> dark -> system -> light. Default is system.

## File structure

```
src/
  app/
    api/
      analyze/route.ts     # POST: extract media info
      download/route.ts    # POST: download media file
      metadata/route.ts    # POST: deep metadata from downloaded file
      stream/route.ts      # GET: proxy media for in-browser playback
    layout.tsx             # Root layout (fonts, theme, SEO metadata)
    page.tsx               # Single route - view orchestration
    icon.svg               # Favicon (Pulliq logo)
    robots.ts              # robots.txt
    sitemap.ts             # sitemap.xml
  components/
    pulliq/                # All Pulliq-specific components
    ui/                    # shadcn/ui components (pre-existing)
  hooks/
    use-analyze.ts         # TanStack Query hook for /api/analyze
    use-download.ts        # Streaming download with progress
  lib/
    media/                 # Core media logic
      types.ts             # API contract (READ FIRST)
      platform.ts          # Platform detection + list
      extract.ts           # yt-dlp wrapper + og:image fallback
      metadata.ts          # Build metadata groups (file/image/video/audio/social)
      clean.ts              # Metadata stripping (exiftool + sharp)
      paths.ts              # Binary paths + temp dir (env-configurable)
      ssrf.ts              # SSRF guard
    format.ts              # Client-side formatting (duration, bytes, count)
    utils.ts               # cn() helper
  store/
    pulliq-store.ts        # Zustand store (view state)
```

## Testing

- YouTube links work reliably for testing extraction + download.
- TikTok/Instagram/Facebook may block automated access - returns honest 422.
- Twitter/X image posts work via og:image fallback.
- Use `bun run lint` to check code quality (must be 0 errors).
- Do NOT write test files. Do NOT run `bun run build` (use `bun run dev`).
