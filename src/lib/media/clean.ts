import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import sharp from "sharp";

/**
 * Metadata stripping for the "Without metadata" feature.
 *
 * - Images: re-encode with sharp WITHOUT `.withMetadata()` so EXIF/GPS/
 *   camera/software tags are dropped. `.rotate()` applies the EXIF orientation
 *   first so the visual orientation is preserved without the tag.
 * - Videos/Audio: use exiftool `-all=` to strip all metadata tags in-place.
 *   This is far more memory-efficient than ffmpeg remuxing (exiftool rewrites
 *   only the file header, not the entire stream).
 */

import { EXIFTOOL as EXIFTOOL_BIN } from "./paths";

/** Field labels that the Clean Copy feature removes. */
export const PRIVACY_REMOVABLE = [
  "GPS",
  "EXIF",
  "Camera Make",
  "Camera Model",
  "Lens",
  "ISO",
  "Exposure",
  "Timestamp",
  "ICC Profile",
  "Software",
  "Orientation",
];

/** Strip metadata from an image file by re-encoding with sharp. */
export async function stripImageMetadata(
  srcPath: string,
  destPath: string
): Promise<void> {
  const meta = await sharp(srcPath).metadata();
  const format = (meta.format || "jpeg") as unknown as string;
  // .rotate() with no args auto-orients from EXIF, then re-encode without
  // .withMetadata() to strip all EXIF/GPS/ICC/software tags.
  await sharp(srcPath).rotate().toFormat(format as any).toFile(destPath);
}

/**
 * Strip metadata from a video or audio file using exiftool.
 * exiftool -all= rewrites the file in-place removing all metadata tags.
 * This is lightweight (header-only rewrite) and doesn't re-encode the stream.
 */
export async function stripVideoMetadata(
  srcPath: string,
  destPath: string
): Promise<void> {
  // Copy the file first, then strip metadata in-place on the copy.
  await fs.copyFile(srcPath, destPath);

  await runExiftool([
    "-overwrite_original",
    "-all=", // strip all metadata tags
    "-api",
    "LargeFileSupport=1",
    destPath,
  ]);
}

/** Run exiftool with a timeout. */
function runExiftool(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(EXIFTOOL_BIN, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
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

    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
    });
    proc.stdout.on("data", () => {
      /* discard */
    });
    proc.on("error", (err) => finish(err));
    proc.on("close", (code) => {
      if (code === 0) finish(null);
      else {
        const tail = stderr.trim().slice(-500);
        finish(
          new Error(`exiftool exited ${code}${tail ? `: ${tail}` : ""}`)
        );
      }
    });

    timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      finish(new Error("exiftool timed out after 60s"));
    }, 60_000);
  });
}
