import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { isValidHttpUrl } from "@/lib/media/platform";
import { assertSafeUrl } from "@/lib/media/ssrf";
import {
  stripImageMetadata,
  stripVideoMetadata,
} from "@/lib/media/clean";
import { extractFallbackMedia, matchDirectMediaUrl } from "@/lib/media/extract";
import { PROCESS_SEM } from "@/lib/media/concurrency";
import { FFMPEG, TMP_BASE, YT_DLP } from "@/lib/media/paths";
import { incrementDownloads } from "@/lib/server-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const DOWNLOAD_TIMEOUT_MS = 90_000;
const TRANSCODE_TIMEOUT_MS = 180_000;
const FILE_TTL_MS = 10 * 60 * 1000;
/** Max time a request waits in the global process queue before giving up. */
const QUEUE_TIMEOUT_MS = 120_000;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Errors we are happy to surface to the user as-is. */
class UserFacingError extends Error {}

/* ---------- helpers ---------- */

function runProcess(
  cmd: string,
  args: string[],
  timeoutMs: number
): Promise<{ stdout: string; stderr: string; code: number }> {
  return PROCESS_SEM.run(
    () =>
      new Promise((resolve, reject) => {
        const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        let settled = false;
        let timer: NodeJS.Timeout | null = null;

        const finish = (
          err: Error | null,
          result?: { stdout: string; stderr: string; code: number }
        ) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          if (err) reject(err);
          else resolve(result!);
        };

        proc.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
        proc.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
        proc.on("error", (err) => finish(err));
        proc.on("close", (code) =>
          finish(null, { stdout, stderr, code: code ?? -1 })
        );

        timer = setTimeout(() => {
          try {
            proc.kill("SIGKILL");
          } catch {
            /* ignore */
          }
          finish(new Error(`${path.basename(cmd)} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    QUEUE_TIMEOUT_MS
  );
}

/** Sanitize a filename: ASCII-safe, strip path separators and control chars. */
function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[\r\n\t]/g, " ")
    .replace(/[\\/:*?"<>|]/g, " ")
    // Strip non-ASCII (emoji, etc.) - HTTP headers must be ByteStrings (latin-1).
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || "pulliq-media";
}

/** Encode a filename for the Content-Disposition header (RFC 5987 + ASCII fallback). */
function contentDispositionFilename(name: string): string {
  const ascii = sanitizeFilename(name).replace(/"/g, "'");
  const utf8 = encodeURIComponent(name.slice(0, 80));
  return `attachment; filename="${ascii || "pulliq-media"}"; filename*=UTF-8''${utf8}`;
}

/** Delete files in TMP_BASE older than FILE_TTL_MS. Best-effort. */
async function cleanupOldFiles(): Promise<void> {
  try {
    const entries = await fs.readdir(TMP_BASE, { withFileTypes: true });
    const now = Date.now();
    await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(TMP_BASE, entry.name);
        try {
          const stat = await fs.stat(fullPath);
          if (now - stat.mtimeMs > FILE_TTL_MS) {
            await fs.rm(fullPath, { recursive: true, force: true });
          }
        } catch {
          /* ignore */
        }
      })
    );
  } catch {
    /* ignore */
  }
}

interface DownloadPlan {
  /** yt-dlp -f format spec */
  formatSpec: string;
  /** optional yt-dlp --format-sort (e.g. prefer h264 so merges remux instead of re-encoding) */
  sort?: string;
  /** target output ext after processing */
  outExt: string;
  /** mime type for the response */
  mime: string;
  kind: "video" | "audio" | "image";
  /** whether to transcode after download */
  transcode: "none" | "scale" | "mp3";
  /** target height for scale transcode */
  targetHeight?: number;
}

function planForFormat(format: string): DownloadPlan | null {
  switch (format) {
    case "original":
      return {
        // Single progressive file (no merge) - lightweight and reliable.
        formatSpec: "best",
        outExt: "",
        mime: "",
        kind: "video",
        transcode: "none",
      };
    case "mp4-1080":
      return {
        // Prefer a single-file progressive stream (no merge = no OOM). Only
        // when the platform only offers separate video+audio streams do we
        // fall back to a merge. The h264 format sort keeps merged streams
        // mp4-native so the merge is a cheap remux, not a re-encode.
        formatSpec: "b[height<=1080]/bv*[height<=1080]+ba/b[height<=1080]/best",
        sort: "vcodec:h264,res,br",
        outExt: "mp4",
        mime: "video/mp4",
        kind: "video",
        transcode: "scale",
        targetHeight: 1080,
      };
    case "mp4-720":
      return {
        formatSpec: "b[height<=720]/bv*[height<=720]+ba/b[height<=720]/best",
        sort: "vcodec:h264,res,br",
        outExt: "mp4",
        mime: "video/mp4",
        kind: "video",
        transcode: "scale",
        targetHeight: 720,
      };
    case "mp4-480":
      return {
        formatSpec: "b[height<=480]/bv*[height<=480]+ba/b[height<=480]/best",
        sort: "vcodec:h264,res,br",
        outExt: "mp4",
        mime: "video/mp4",
        kind: "video",
        transcode: "scale",
        targetHeight: 480,
      };
    case "mp3-128":
      return {
        formatSpec: "bestaudio/best",
        outExt: "mp3",
        mime: "audio/mpeg",
        kind: "audio",
        transcode: "mp3",
      };
    default:
      return null;
  }
}

/**
 * Download source via yt-dlp to a temp file. Returns the path to the
 * downloaded file and the title (for filename). yt-dlp auto-sanitizes
 * the title for filesystem safety via the output template.
 */
async function downloadSource(
  url: string,
  workDir: string,
  formatSpec: string,
  formatSort?: string
): Promise<{ filePath: string; title: string }> {
  const outTemplate = path.join(workDir, "source.%(ext)s");
  const args = [
    "--no-warnings",
    "--no-playlist",
    "--no-simulate",
    "--merge-output-format",
    "mp4",
    ...(formatSort ? ["--format-sort", formatSort] : []),
    "-f",
    formatSpec,
    "-o",
    outTemplate,
    "--print",
    "after_move:%(title)s",
    url,
  ];
  const { stdout, stderr, code } = await runProcess(
    YT_DLP,
    args,
    DOWNLOAD_TIMEOUT_MS
  );
  if (code !== 0) {
    throw new Error(
      `yt-dlp download failed${stderr.trim() ? `: ${stderr.trim().slice(-400)}` : ""}`
    );
  }
  const title = stdout.trim().split("\n")[0] || "pulliq-media";

  // Find the downloaded file (yt-dlp may produce source.mp4, source.webm,
  // source.mkv, or a merged file). Look for any file starting with "source".
  const entries = await fs.readdir(workDir);
  const file = entries.find((f) => f.startsWith("source."));
  if (!file) {
    throw new Error("yt-dlp produced no file");
  }
  return { filePath: path.join(workDir, file), title };
}

/** Stream any remote URL to a local file. Returns false on failure. */
async function streamUrlToFile(remoteUrl: string, filePath: string): Promise<boolean> {
  try {
    const res = await fetch(remoteUrl, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return false;
    const out = createWriteStream(filePath);
    await new Promise<void>((resolve, reject) => {
      const body = res.body as unknown as NodeJS.ReadableStream;
      Readable.fromWeb(body as any)
        .pipe(out)
        .on("finish", () => resolve())
        .on("error", reject);
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Fallback: download media directly from page meta tags (og:video,
 * twitter:player:stream, og:image) or from a direct media file URL.
 * Used when yt-dlp fails, e.g. Twitter/X image posts, Pinterest pins, or
 * pages exposing a direct video URL. Streams to disk so large files never
 * sit in memory.
 */
async function downloadDirectFallback(
  url: string,
  workDir: string
): Promise<{ filePath: string; title: string; ext: string; kind: string } | null> {
  // The pasted link itself is a media file (e.g. https://x/y/photo.jpg).
  const direct = matchDirectMediaUrl(url);
  if (direct) {
    const filePath = path.join(workDir, `source.${direct.ext}`);
    const ok = await streamUrlToFile(url, filePath);
    if (!ok) return null;
    return { filePath, title: "Media", ext: direct.ext, kind: direct.kind };
  }

  const fb = await extractFallbackMedia(url);
  if (!fb) return null;

  const filePath = path.join(workDir, `source.${fb.ext}`);
  const ok = await streamUrlToFile(fb.url, filePath);
  if (!ok) return null;
  return { filePath, title: fb.title, ext: fb.ext, kind: fb.kind };
}

async function transcodeVideo(
  src: string,
  dest: string,
  targetHeight: number
): Promise<void> {
  const args = [
    "-y",
    "-i",
    src,
    "-vf",
    `scale=-2:${targetHeight}`,
    "-c:v",
    "libx264",
    "-crf",
    "23",
    "-preset",
    "veryfast",
    "-threads",
    "2",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    dest,
  ];
  const { stderr, code } = await runProcess(
    FFMPEG,
    args,
    TRANSCODE_TIMEOUT_MS
  );
  if (code !== 0) {
    throw new Error(
      `ffmpeg transcode failed${stderr.trim() ? `: ${stderr.trim().slice(-400)}` : ""}`
    );
  }
}

async function transcodeMp3(src: string, dest: string): Promise<void> {
  const args = [
    "-y",
    "-i",
    src,
    "-vn",
    "-c:a",
    "libmp3lame",
    "-qscale:a",
    "2",
    "-threads",
    "2",
    dest,
  ];
  const { stderr, code } = await runProcess(
    FFMPEG,
    args,
    TRANSCODE_TIMEOUT_MS
  );
  if (code !== 0) {
    throw new Error(
      `ffmpeg mp3 transcode failed${stderr.trim() ? `: ${stderr.trim().slice(-400)}` : ""}`
    );
  }
}

function guessMimeFromExt(ext: string): string {
  const e = ext.toLowerCase().replace(/^\./, "");
  const map: Record<string, string> = {
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    mkv: "video/x-matroska",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
  };
  return map[e] || "application/octet-stream";
}

/* ---------- route handlers ---------- */

export async function POST(req: Request) {
  let body: { url?: unknown; format?: unknown; clean?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  const format = typeof body?.format === "string" ? body.format : "";
  const clean = body?.clean === true;

  if (!url || !isValidHttpUrl(url)) {
    return NextResponse.json(
      { ok: false, error: "Invalid URL" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  // SSRF guard - reject private/internal targets.
  try {
    await assertSafeUrl(url);
  } catch {
    return NextResponse.json(
      { ok: false, error: "URL is not allowed." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const plan = planForFormat(format);
  if (!plan) {
    return NextResponse.json(
      { ok: false, error: "Unsupported format" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  // Ensure tmp dir exists; sweep old files.
  await fs.mkdir(TMP_BASE, { recursive: true }).catch(() => {});
  await cleanupOldFiles();

  const workDir = path.join(
    TMP_BASE,
    `dl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  await fs.mkdir(workDir, { recursive: true }).catch(() => {});

  let finalPath: string | null = null;
  let finalExt = plan.outExt;
  let finalMime = plan.mime;
  let downloadTitle = "pulliq-media";

  try {
    // Step 1: download source via yt-dlp.
    let srcPath: string;
    let srcExt: string;
    try {
      const result = await downloadSource(url, workDir, plan.formatSpec, plan.sort);
      srcPath = result.filePath;
      downloadTitle = result.title;
      srcExt = path.extname(srcPath).slice(1).toLowerCase();
    } catch (dlErr) {
      // yt-dlp failed (e.g. Twitter image post). Try the direct media
      // fallback: page meta tags (og:video / og:image).
      const fbResult = await downloadDirectFallback(url, workDir);
      if (!fbResult) throw dlErr;
      if (fbResult.kind === "image" && plan.transcode !== "none") {
        throw new UserFacingError(
          "This link contains an image, not video or audio. It can only be downloaded as the original file."
        );
      }
      srcPath = fbResult.filePath;
      downloadTitle = fbResult.title;
      srcExt = fbResult.ext;
    }

    // Step 2: process based on plan.
    if (plan.transcode === "scale" && plan.targetHeight) {
      finalExt = "mp4";
      finalMime = "video/mp4";
      finalPath = path.join(workDir, `out.${finalExt}`);
      await transcodeVideo(srcPath, finalPath, plan.targetHeight);
    } else if (plan.transcode === "mp3") {
      finalExt = "mp3";
      finalMime = "audio/mpeg";
      finalPath = path.join(workDir, `out.${finalExt}`);
      await transcodeMp3(srcPath, finalPath);
    } else {
      // original - keep source file as-is.
      finalExt = srcExt || "mp4";
      finalMime = plan.mime || guessMimeFromExt(finalExt);
      finalPath = srcPath;
    }

    // Step 3: optional clean (metadata strip).
    if (clean) {
      const cleanedPath = path.join(workDir, `clean.${finalExt}`);
      const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(finalPath);
      try {
        if (isImage) {
          await stripImageMetadata(finalPath, cleanedPath);
        } else {
          await stripVideoMetadata(finalPath, cleanedPath);
        }
        finalPath = cleanedPath;
      } catch (err) {
        console.error("[download] clean step failed:", err);
        // proceed without cleaning - file is still valid
      }
    }

    // Step 4: stream file to client.
    const stat = await fs.stat(finalPath);
    const filename = `${sanitizeFilename(downloadTitle)}.${finalExt}`;
    const stream = createReadStream(finalPath);

    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        stream.on("data", (chunk: Buffer) => {
          // Buffer is a Uint8Array subclass - pass a view to avoid copying.
          controller.enqueue(
            new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
          );
        });
        stream.on("end", () => controller.close());
        stream.on("error", (err) => controller.error(err));
      },
      cancel() {
        stream.destroy();
      },
    });

    // Schedule cleanup of this work dir after streaming should be done.
    setTimeout(() => {
      fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }, 5 * 60 * 1000).unref?.();

    incrementDownloads();

    return new Response(readable, {
      status: 200,
      headers: {
        "Content-Type": finalMime,
        "Content-Disposition": contentDispositionFilename(filename),
        "Content-Length": String(stat.size),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    // Clean up work dir on error.
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});

    const msg = err instanceof Error ? err.message : String(err);
    console.error("[download] failed:", msg);

    if (err instanceof UserFacingError) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: 422, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (msg.includes("Server is busy")) {
      return NextResponse.json(
        { ok: false, error: msg },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    // If yt-dlp couldn't resolve/download (often the case for demo URLs or
    // platforms that block the sandbox), return a clear 409.
    return NextResponse.json(
      {
        ok: false,
        error:
          "This media could not be fetched for download. Live download is unavailable for this link in this environment.",
      },
      { status: 409, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "POST /api/download",
    description:
      "Download a media file at the requested format. Streams the file with Content-Disposition attachment.",
    body: { url: "string", format: "string", clean: "boolean?" },
    formats: ["original", "mp4-1080", "mp4-720", "mp4-480", "mp3-128"],
  });
}
