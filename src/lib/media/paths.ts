import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";

/**
 * Runtime paths for media binaries and temp storage.
 *
 * Resolution order per binary:
 *   1. Explicit env override (YT_DLP_PATH, FFMPEG_PATH, ...)
 *   2. Local `bin/` directory (populated by `bun run setup:binaries`,
 *      handy on dev machines that lack a system install)
 *   3. PATH (normal system install)
 */

function localBin(name: string): string {
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  return path.join(process.cwd(), "bin", exe);
}

function resolveBinary(envKey: string, name: string): string {
  const fromEnv = process.env[envKey];
  if (fromEnv) return fromEnv;
  const local = localBin(name);
  if (existsSync(local)) return local;
  return name;
}

export const YT_DLP = resolveBinary("YT_DLP_PATH", "yt-dlp");
export const FFMPEG = resolveBinary("FFMPEG_PATH", "ffmpeg");
export const FFPROBE = resolveBinary("FFPROBE_PATH", "ffprobe");
export const EXIFTOOL =
  process.env.EXIFTOOL_PATH ??
  path.join(process.cwd(), "node_modules/exiftool-vendored.pl/bin/exiftool");

/** Base temp dir for working files (override via TMP_DIR for deployment). */
export const TMP_BASE =
  process.env.TMP_DIR ?? path.join(os.tmpdir(), "pulliq");
