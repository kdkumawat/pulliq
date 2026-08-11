import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { assertSafeUrl } from "@/lib/media/ssrf";
import { isHlsMediaUrl, resolveCookiesFile } from "@/lib/media/extract";
import { PROCESS_SEM } from "@/lib/media/concurrency";
import { FFMPEG } from "@/lib/media/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
/** Max time a request waits in the global process queue before giving up. */
const QUEUE_TIMEOUT_MS = 60_000;
/** Safety cap for a single HLS remux stream (client usually closes earlier). */
const STREAM_CAP_MS = 10 * 60 * 1000;

/**
 * Referer to send to a media CDN host. Several CDNs (twimg, fbcdn, ...) 403
 * requests that do not carry a Referer from the owning site.
 */
function upstreamReferer(host: string): string {
  if (/twimg\.com$/i.test(host) || /twitter\.com$/i.test(host) || /x\.com$/i.test(host)) {
    return "https://x.com/";
  }
  if (/fbcdn\.net$/i.test(host) || /facebook\.com$/i.test(host)) {
    return "https://www.facebook.com/";
  }
  if (/cdninstagram\.com$/i.test(host) || /instagram\.com$/i.test(host)) {
    return "https://www.instagram.com/";
  }
  if (/tiktokcdn/i.test(host)) {
    return "https://www.tiktok.com/";
  }
  return "";
}

/**
 * GET /api/stream?u=<encoded direct media url>
 *
 * Proxies a remote media URL back to the browser so that <video>/<audio>
 * elements can play it without CORS issues. Two modes:
 *  - HLS (.m3u8): remuxed on the fly to fragmented MP4 with ffmpeg, because
 *    Chrome/Firefox cannot play HLS natively (this is why X/Twitter video
 *    previews failed).
 *  - Direct media: proxied byte-for-byte with Range (seek) support.
 * The URL is SSRF-validated before fetching.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("u");
  if (!raw) {
    return NextResponse.json(
      { ok: false, error: "Missing 'u' parameter." },
      { status: 400 }
    );
  }

  // SSRF guard - throws on private/loopback/link-local hosts.
  let parsed: URL;
  try {
    parsed = await assertSafeUrl(raw);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Forbidden source URL." },
      { status: 403 }
    );
  }

  if (isHlsMediaUrl(parsed.href)) {
    return streamHls(parsed.href, upstreamReferer(parsed.hostname), req);
  }
  return proxyDirect(parsed.href, parsed.hostname, req);
}

/* ------------------------------------------------------------------ */
/* HLS -> fragmented MP4 remux                                         */
/* ------------------------------------------------------------------ */

async function streamHls(
  mediaUrl: string,
  referer: string,
  req: Request
): Promise<Response> {
  // Hold a process slot for the whole stream, not just the spawn. If the
  // queue is full, return an honest 503 instead of a broken stream.
  try {
    await PROCESS_SEM.acquire(QUEUE_TIMEOUT_MS);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Server is busy, please try again in a moment." },
      { status: 503 }
    );
  }

  // The client may have disconnected while we were queued. Already-aborted
  // signals never fire 'once' listeners, so check explicitly to avoid
  // spawning an orphan remux into a dead socket.
  if (req.signal?.aborted) {
    PROCESS_SEM.release();
    return NextResponse.json(
      { ok: false, error: "Request cancelled." },
      { status: 499 }
    );
  }

  let released = false;
  const release = () => {
    if (!released) {
      released = true;
      PROCESS_SEM.release();
    }
  };

  const headers =
    `User-Agent: ${UA}\r\n` + (referer ? `Referer: ${referer}\r\n` : "");
  const cookiesFile = await resolveCookiesFile();
  const args = [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-headers",
    headers,
    // Keep one HTTP connection open so the headers above (Referer, UA) are
    // also sent with every HLS segment request - CDNs like twimg 403
    // segment fetches that drop the Referer.
    "-http_persistent",
    "1",
    ...(cookiesFile ? ["-cookies", cookiesFile] : []),
    "-i",
    mediaUrl,
    "-c",
    "copy",
    // Fragmented MP4 streams from a pipe (faststart needs a seekable file).
    "-movflags",
    "frag_keyframe+empty_moov+default_base_moof",
    "-f",
    "mp4",
    "pipe:1",
  ];
  const proc = spawn(FFMPEG, args, { stdio: ["ignore", "pipe", "pipe"] });

  let stderr = "";
  proc.stderr.on("data", (d: Buffer) => {
    stderr += d.toString("utf8").slice(-2000);
  });

  let stdoutEnded = false;
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      proc.stdout.on("data", (d: Buffer) => {
        controller.enqueue(new Uint8Array(d.buffer, d.byteOffset, d.byteLength));
      });
      proc.stdout.on("end", () => {
        stdoutEnded = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
        release();
      });
      proc.on("error", (err) => {
        console.error("[stream] ffmpeg error:", err.message);
        try {
          controller.error(err);
        } catch {
          /* ignore */
        }
        release();
      });
      proc.on("close", (code) => {
        if (!stdoutEnded) {
          console.error("[stream] ffmpeg exited", code, stderr.trim().slice(-300));
          try {
            controller.error(new Error(`transcode failed (${code})`));
          } catch {
            /* ignore */
          }
        }
        release();
      });
    },
    cancel() {
      killProc(proc);
      release();
    },
  });

  // Kill the remux when the client disconnects (no slot leaks).
  const abort = () => {
    killProc(proc);
    release();
  };
  req.signal?.addEventListener("abort", abort, { once: true });

  // Safety cap for hung remuxes.
  const capTimer = setTimeout(() => {
    killProc(proc);
    release();
  }, STREAM_CAP_MS);
  capTimer.unref?.();

  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Cache-Control": "no-store",
      // No range support on a live remux - don't advertise it.
      "Accept-Ranges": "none",
    },
  });
}

/* ------------------------------------------------------------------ */
/* direct media proxy                                                  */
/* ------------------------------------------------------------------ */

async function proxyDirect(
  mediaUrl: string,
  host: string,
  req: Request
): Promise<Response> {
  const forcedReferer = upstreamReferer(host);
  const upstreamHeaders: Record<string, string> = {
    "user-agent": UA,
    accept: "*/*",
  };
  if (forcedReferer) upstreamHeaders["referer"] = forcedReferer;

  // Forward Range header for seeking + a realistic UA (some CDNs require one).
  const range = req.headers.get("range");
  if (range) upstreamHeaders["range"] = range;
  const browserReferer = req.headers.get("referer");
  if (!forcedReferer && browserReferer) upstreamHeaders["referer"] = browserReferer;

  let upstream: Response;
  try {
    upstream = await fetch(mediaUrl, {
      headers: upstreamHeaders,
      redirect: "follow",
      // @ts-expect-error - Next.js fetch supports this duplex option for streaming.
      duplex: "half",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[stream] upstream fetch failed:", msg);
    return NextResponse.json(
      { ok: false, error: "Could not reach the media source." },
      { status: 502 }
    );
  }

  if (!upstream.ok) {
    // Log blocked sources - the most common cause of "preview failed" is a
    // CDN 403/404 (twimg, fbcdn, ... usually need login cookies). Pass the
    // real status through (only 5xx collapse to 502); a 416 here is a
    // normal out-of-range seek answer and must not be rewritten.
    console.error(
      `[stream] upstream ${upstream.status} for ${host} (referer: ${forcedReferer || "none"})`
    );
    return NextResponse.json(
      { ok: false, error: `The media source returned ${upstream.status}.` },
      { status: upstream.status >= 500 ? 502 : upstream.status }
    );
  }

  // Build response headers, forwarding the ones <video> needs.
  const respHeaders = new Headers();
  const forward = [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "last-modified",
    "etag",
  ];
  for (const h of forward) {
    const v = upstream.headers.get(h);
    if (v) respHeaders.set(h, v);
  }
  // Always advertise range support so the browser attempts seeking.
  if (!respHeaders.has("accept-ranges")) {
    respHeaders.set("accept-ranges", "bytes");
  }
  respHeaders.set("cache-control", "public, max-age=3600");

  if (!upstream.body) {
    return NextResponse.json(
      { ok: false, error: "Empty media response." },
      { status: 502 }
    );
  }

  return new Response(upstream.body as unknown as BodyInit, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
}

function killProc(proc: ReturnType<typeof spawn>): void {
  try {
    proc.kill("SIGKILL");
  } catch {
    /* ignore */
  }
}
