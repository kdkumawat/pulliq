import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { isValidHttpUrl } from "@/lib/media/platform";
import { assertSafeUrl } from "@/lib/media/ssrf";
import {
  stripImageMetadata,
  stripVideoMetadata,
} from "@/lib/media/clean";
import { FFMPEG, TMP_BASE, YT_DLP } from "@/lib/media/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const DOWNLOAD_TIMEOUT_MS = 90_000;
const TRANSCODE_TIMEOUT_MS = 180_000;
const FILE_TTL_MS = 10 * 60 * 1000;

/* ---------- helpers ---------- */

function runProcess(
  cmd: string,
  args: string[],
  timeoutMs: number
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer: NodeJS.Timeout | null = null;

    const finish = (err: Error | null, result?: { stdout: string; stderr: string; code: number }) => {
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
  });
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
        // Try merged bestvideo+bestaudio up to 1080p, fall back to best.
        formatSpec: "bv*[height<=1080]+ba/b[height<=1080]/best",
        outExt: "mp4",
        mime: "video/mp4",
        kind: "video",
        transcode: "scale",
        targetHeight: 1080,
      };
    case "mp4-720":
      return {
        formatSpec: "bv*[height<=720]+ba/b[height<=720]/best",
        outExt: "mp4",
        mime: "video/mp4",
        kind: "video",
        transcode: "scale",
        targetHeight: 720,
      };
    case "mp4-480":
      return {
        formatSpec: "bv*[height<=480]+ba/b[height<=480]/best",
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
  formatSpec: string
): Promise<{ filePath: string; title: string }> {
  const outTemplate = path.join(workDir, "source.%(ext)s");
  // --print captures the title in the same pass. --print implies --simulate,
  // so we add --no-simulate to force the actual download. --merge-output-format
  // ensures merged video+audio lands in a single mp4 container.
  const args = [
    "--no-warnings",
    "--no-playlist",
    "--no-simulate",
    "--merge-output-format",
    "mp4",
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

/**
 * Fallback: download an image directly by extracting og:image from the page HTML.
 * Used when yt-dlp fails (e.g. Twitter/X image posts).
 * Returns { filePath, title, ext } or null if no image found.
 */
async function downloadDirectImage(
  url: string,
  workDir: string
): Promise<{ filePath: string; title: string; ext: string } | null> {
  try {
    // Fetch the page HTML.
    const pageRes = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!pageRes.ok) return null;
    const html = await pageRes.text();

    // Extract og:image URL.
    const imgMatch = /<meta\s+(?:property|name)=["'](?:og:image|twitter:image)(?::url)?["']\s+content=["']([^"']+)["']/i.exec(html);
    if (!imgMatch || !imgMatch[1]) return null;
    const imgUrl = imgMatch[1].trim();
    if (!imgUrl.startsWith("http")) return null;

    // Extract title.
    const titleMatch = /<meta\s+property=["']og:title["']\s+content=["']([^"']*)["']/i.exec(html);
    const siteMatch = /<meta\s+property=["']og:site_name["']\s+content=["']([^"']*)["']/i.exec(html);
    const title = titleMatch?.[1] || siteMatch?.[1] || "image";

    // Determine extension from URL.
    const ext = imgUrl.match(/\.(jpg|jpeg|png|webp|gif)/i)?.[1]?.toLowerCase() || "jpg";

    // Download the image.
    const imgRes = await fetch(imgUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!imgRes.ok) return null;
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const filePath = path.join(workDir, `source.${ext}`);
    await fs.writeFile(filePath, buf);

    return { filePath, title, ext };
  } catch {
    return null;
  }
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
      const result = await downloadSource(url, workDir, plan.formatSpec);
      srcPath = result.filePath;
      downloadTitle = result.title;
      srcExt = path.extname(srcPath).slice(1).toLowerCase();
    } catch (dlErr) {
      // yt-dlp failed (e.g. Twitter image post). Try direct image fallback:
      // fetch the page HTML, extract og:image, download the image directly.
      if (format === "original" || format === "mp3-128") {
        const imgResult = await downloadDirectImage(url, workDir);
        if (imgResult) {
          srcPath = imgResult.filePath;
          downloadTitle = imgResult.title;
          srcExt = imgResult.ext;
        } else {
          throw dlErr;
        }
      } else {
        throw dlErr;
      }
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
