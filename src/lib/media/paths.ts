import os from "node:os";
import path from "node:path";

/** Runtime paths for media binaries and temp storage (override via env for deployment). */
export const YT_DLP = process.env.YT_DLP_PATH ?? "yt-dlp";
export const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
export const FFPROBE = process.env.FFPROBE_PATH ?? "ffprobe";
export const EXIFTOOL =
  process.env.EXIFTOOL_PATH ??
  path.join(process.cwd(), "node_modules/exiftool-vendored.pl/bin/exiftool");
export const TMP_BASE =
  process.env.TMP_DIR ?? path.join(os.tmpdir(), "pulliq");
