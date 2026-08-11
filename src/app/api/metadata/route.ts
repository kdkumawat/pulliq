import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  detectPlatform,
  isValidHttpUrl,
} from "@/lib/media/platform";
import { assertSafeUrl } from "@/lib/media/ssrf";
import { extractMedia, type RawExtract } from "@/lib/media/extract";
import {
  buildMetadataForFile,
} from "@/lib/media/metadata";
import { PRIVACY_REMOVABLE } from "@/lib/media/clean";
import { PROCESS_SEM } from "@/lib/media/concurrency";
import { TMP_BASE, YT_DLP } from "@/lib/media/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const DOWNLOAD_TIMEOUT_MS = 90_000;
const FILE_TTL_MS = 10 * 60 * 1000;

/* ---------- rate limit (in-process) ---------- */

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 12;
const rateMap = new Map<string, number[]>();

function rateLimit(ip: string): boolean {
  const now = Date.now();
  if (rateMap.size > 2000) rateMap.clear();
  const arr = (rateMap.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) {
    rateMap.set(ip, arr);
    return false;
  }
  arr.push(now);
  rateMap.set(ip, arr);
  return true;
}

function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

/* ---------- helpers ---------- */

function runYtDlp(args: string[], timeoutMs: number): Promise<void> {
  return PROCESS_SEM.run(
    () =>
      new Promise((resolve, reject) => {
        const proc = spawn(YT_DLP, args, { stdio: ["ignore", "pipe", "pipe"] });
        let stderr = "";
        let settled = false;
        let timer: NodeJS.Timeout | null = null;

        const finish = (err: Error | null) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          if (err) reject(err);
          else resolve();
        };

        proc.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
        proc.stdout.on("data", () => {
          /* discard */
        });
        proc.on("error", (err) => finish(err));
        proc.on("close", (code) => {
          if (code === 0) finish(null);
          else {
            finish(
              new Error(
                `yt-dlp exited ${code}${stderr.trim() ? `: ${stderr.trim().slice(-400)}` : ""}`
              )
            );
          }
        });

        timer = setTimeout(() => {
          try {
            proc.kill("SIGKILL");
          } catch {
            /* ignore */
          }
          finish(new Error(`yt-dlp timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    timeoutMs + 20_000
  );
}

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

/* ---------- route handlers ---------- */

export async function POST(req: Request) {
  const ip = getClientIp(req);
  if (!rateLimit(ip)) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Cache-Control": "no-store" } }
    );
  }

  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const url = typeof body?.url === "string" ? body.url.trim() : "";

  if (!url || !isValidHttpUrl(url)) {
    return NextResponse.json(
      { ok: false, error: "Invalid URL" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    await assertSafeUrl(url);
  } catch {
    return NextResponse.json(
      { ok: false, error: "URL is not allowed." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const platform = detectPlatform(url);

  await fs.mkdir(TMP_BASE, { recursive: true }).catch(() => {});
  await cleanupOldFiles();

  const workDir = path.join(
    TMP_BASE,
    `meta-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  await fs.mkdir(workDir, { recursive: true }).catch(() => {});

  const outTemplate = path.join(workDir, "source.%(ext)s");

  try {
    // Download best quality source to a temp file.
    await runYtDlp(
      [
        "--no-warnings",
        "--no-playlist",
        "-f",
        "best",
        "-o",
        outTemplate,
        url,
      ],
      DOWNLOAD_TIMEOUT_MS
    );

    const entries = await fs.readdir(workDir);
    const file = entries.find((f) => f.startsWith("source."));
    if (!file) {
      throw new Error("yt-dlp produced no file");
    }
    const tmpPath = path.join(workDir, file);

    // Also fetch the raw extract (best-effort) for the social group.
    let raw: RawExtract | undefined;
    try {
      raw = await extractMedia(url);
    } catch {
      raw = undefined;
    }

    const groups = await buildMetadataForFile(tmpPath, { platform, raw });

    return NextResponse.json(
      {
        ok: true,
        groups,
        privacyRemovable: PRIVACY_REMOVABLE,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[metadata] failed:", msg);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Could not fetch media for metadata inspection. Live download is unavailable for this link in this environment.",
      },
      { status: 409, headers: { "Cache-Control": "no-store" } }
    );
  } finally {
    // The metadata response doesn't include the file, so we can safely
    // delete the work dir now.
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "POST /api/metadata",
    description:
      "Download the media to a temp file and return full metadata groups (file/image/video/social) using exiftool + ffprobe + sharp.",
    body: { url: "string" },
    rateLimit: `${RATE_MAX} requests per minute per IP`,
  });
}
