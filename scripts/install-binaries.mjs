#!/usr/bin/env node
/**
 * Install local media binaries (yt-dlp + ffmpeg/ffprobe) into ./bin so the
 * app works on dev machines that lack a system install (e.g. Windows).
 *
 * Usage:
 *   bun run setup:binaries            # yt-dlp + ffmpeg (skips what exists)
 *   bun run setup:binaries -- --force # re-download everything
 *   bun run setup:binaries -- --skip-ffmpeg
 *   bun run setup:binaries -- --skip-yt-dlp
 *
 * Binaries are resolved at runtime by src/lib/media/paths.ts (env override ->
 * ./bin -> PATH).
 */
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import process from "node:process";

const BIN_DIR = path.join(process.cwd(), "bin");
const platform = process.platform;
const arch = process.arch;
const flags = new Set(process.argv.slice(2));
const force = flags.has("--force");
const skipYtDlp = flags.has("--skip-yt-dlp");
const skipFfmpeg = flags.has("--skip-ffmpeg");

const exe = (name) => (platform === "win32" ? `${name}.exe` : name);
const downloadUrl = (url) => {
  console.log(`Downloading ${url}`);
  return fetch(url, { redirect: "follow" });
};
const saveStream = async (res, dest) =>
  new Promise((resolve, reject) => {
    const out = createWriteStream(dest);
    Readable.fromWeb(res.body).pipe(out);
    out.on("finish", resolve);
    out.on("error", reject);
  });

mkdirSync(BIN_DIR, { recursive: true });

/* ---------------- yt-dlp ---------------- */
if (!skipYtDlp) {
  const ytDest = path.join(BIN_DIR, exe("yt-dlp"));
  if (!force && existsSync(ytDest)) {
    console.log("yt-dlp already installed, skipping (use --force to update).");
  } else {
    const base = "https://github.com/yt-dlp/yt-dlp/releases/latest/download";
    const asset =
      platform === "win32"
        ? "yt-dlp.exe"
        : platform === "darwin"
          ? "yt-dlp_macos"
          : "yt-dlp";
    try {
      const res = await downloadUrl(`${base}/${asset}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const tmp = `${ytDest}.tmp`;
      await saveStream(res, tmp);
      if (platform !== "win32") chmodSync(tmp, 0o755);
      renameSync(tmp, ytDest);
      console.log(`Installed yt-dlp -> ${ytDest}`);
    } catch (err) {
      console.error(`Failed to install yt-dlp: ${err.message}`);
      process.exitCode = 1;
    }
  }
}

/* ---------------- ffmpeg + ffprobe ---------------- */
if (!skipFfmpeg) {
  if (platform === "darwin") {
    console.warn("Skipping ffmpeg on macOS - install via 'brew install ffmpeg'.");
  } else {
    const ffDest = path.join(BIN_DIR, exe("ffmpeg"));
    if (!force && existsSync(ffDest)) {
      console.log("ffmpeg already installed, skipping (use --force to update).");
    } else {
      const build =
        platform === "win32"
          ? "ffmpeg-master-latest-win64-gpl.zip"
          : arch === "arm64"
            ? "ffmpeg-master-latest-linuxarm64-gpl.tar.xz"
            : "ffmpeg-master-latest-linux64-gpl.tar.xz";
      const archive = path.join(BIN_DIR, build);
      const extractDir = path.join(BIN_DIR, "ffmpeg-extract");
      try {
        const res = await downloadUrl(`https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/${build}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await saveStream(res, archive);
        rmSync(extractDir, { recursive: true, force: true });
        mkdirSync(extractDir, { recursive: true });
        // Extract with relative paths + cwd (Git Bash's tar treats
        // drive-letter absolute paths as remote hosts). Use unzip for .zip
        // (GNU tar cannot read zip), tar for .tar.xz.
        const isZip = archive.endsWith(".zip");
        const extractCmd = isZip ? "unzip" : "tar";
        const extractArgs = isZip
          ? ["-q", "-o", path.basename(archive), "-d", path.basename(extractDir)]
          : ["-xf", path.basename(archive), "-C", path.basename(extractDir)];
        execFileSync(extractCmd, extractArgs, {
          stdio: "inherit",
          cwd: BIN_DIR,
        });
        const walk = (dir) =>
          readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
            const p = path.join(dir, e.name);
            return e.isDirectory() ? walk(p) : [p];
          });
        const moved = [];
        for (const p of walk(extractDir)) {
          const name = path.basename(p);
          if (name === exe("ffmpeg") || name === exe("ffprobe")) {
            renameSync(p, path.join(BIN_DIR, name));
            moved.push(name);
          }
        }
        if (platform !== "win32") {
          moved.forEach((n) => chmodSync(path.join(BIN_DIR, n), 0o755));
        }
        rmSync(extractDir, { recursive: true, force: true });
        rmSync(archive, { force: true });
        console.log(`Installed ${moved.join(", ")} -> ${BIN_DIR}`);
      } catch (err) {
        console.error(`Failed to install ffmpeg: ${err.message}`);
        process.exitCode = 1;
      }
    }
  }
}

console.log("Done. Restart the dev server for paths.ts to pick up ./bin.");
