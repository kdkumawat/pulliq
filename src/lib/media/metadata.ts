import { spawn } from "node:child_process";
import { exiftool } from "exiftool-vendored";
import sharp from "sharp";
import type {
  MetaField,
  MetaGroup,
  PlatformId,
} from "./types";
import type { RawExtract, RawFormat } from "./extract";
import { FFPROBE } from "./paths";

/* ---------- field catalog (shared by analyze + metadata routes) ---------- */

export const FILE_FIELDS = [
  { key: "filename", label: "Filename" },
  { key: "ext", label: "Extension" },
  { key: "mime", label: "MIME Type" },
  { key: "resolution", label: "Resolution" },
  { key: "size", label: "Size" },
  { key: "dimensions", label: "Dimensions" },
  { key: "bitrate", label: "Bitrate" },
  { key: "framerate", label: "Frame Rate" },
  { key: "codec", label: "Codec" },
  { key: "colorspace", label: "Color Space" },
  { key: "container", label: "Container" },
  { key: "aspect", label: "Aspect Ratio" },
] as const;

export const IMAGE_FIELDS = [
  { key: "exif", label: "EXIF" },
  { key: "gps", label: "GPS" },
  { key: "make", label: "Camera Make" },
  { key: "model", label: "Camera Model" },
  { key: "lens", label: "Lens" },
  { key: "iso", label: "ISO" },
  { key: "exposure", label: "Exposure" },
  { key: "timestamp", label: "Timestamp" },
  { key: "icc", label: "ICC Profile" },
  { key: "software", label: "Software" },
  { key: "orientation", label: "Orientation" },
] as const;

export const VIDEO_FIELDS = [
  { key: "vcodec", label: "Video Codec" },
  { key: "acodec", label: "Audio Codec" },
  { key: "channels", label: "Channels" },
  { key: "samplerate", label: "Sample Rate" },
  { key: "hdr", label: "HDR" },
  { key: "rotation", label: "Rotation" },
  { key: "bitrate", label: "Bitrate" },
  { key: "container", label: "Container" },
] as const;

/** Fields shown for an audio-only source (music tracks, podcasts, etc). */
export const AUDIO_FIELDS = [
  { key: "acodec", label: "Audio Codec" },
  { key: "channels", label: "Channels" },
  { key: "samplerate", label: "Sample Rate" },
  { key: "bitrate", label: "Bitrate" },
  { key: "duration", label: "Duration" },
  { key: "container", label: "Container" },
  { key: "artist", label: "Artist" },
  { key: "album", label: "Album" },
  { key: "genre", label: "Genre" },
  { key: "track", label: "Track Number" },
] as const;

/* ---------- formatting helpers ---------- */

export function humanFileSize(bytes?: number | null): string {
  if (!bytes || !isFinite(bytes as number) || (bytes as number) <= 0) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let b = bytes as number;
  let i = 0;
  while (b >= 1024 && i < units.length - 1) {
    b /= 1024;
    i++;
  }
  return `${b.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function humanBitrate(kbps?: number | null): string {
  if (!kbps || !isFinite(kbps as number) || (kbps as number) <= 0) return "-";
  const k = kbps as number;
  if (k >= 1000) return `${(k / 1000).toFixed(2)} Mbps`;
  return `${Math.round(k)} kbps`;
}

export function formatCount(n?: number | null): string {
  if (n == null) return "-";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

/** Format seconds as M:SS or H:MM:SS. */
export function formatDuration(seconds?: number | null): string {
  if (!seconds || !isFinite(seconds) || seconds <= 0) return "-";
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function simplifyRatio(w?: number, h?: number): string | null {
  if (!w || !h || w <= 0 || h <= 0) return null;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(w, h);
  let rw = Math.round(w / g);
  let rh = Math.round(h / g);
  // Cap large ratios (e.g. 1920:1080 -> 16:9 already, but for odd sizes).
  if (rw > 50 || rh > 50) {
    const r = w / h;
    if (Math.abs(r - 16 / 9) < 0.02) return "16:9";
    if (Math.abs(r - 9 / 16) < 0.02) return "9:16";
    if (Math.abs(r - 4 / 3) < 0.02) return "4:3";
    if (Math.abs(r - 1) < 0.02) return "1:1";
    if (Math.abs(r - 3 / 4) < 0.02) return "3:4";
    if (Math.abs(r - 21 / 9) < 0.02) return "21:9";
    return `${r.toFixed(2)}:1`;
  }
  return `${rw}:${rh}`;
}

function evalFps(rate?: string): string | null {
  if (!rate || rate === "0/0") return null;
  const m = rate.match(/^(\d+)\/(\d+)$/);
  if (!m) return null;
  const num = parseInt(m[1], 10);
  const den = parseInt(m[2], 10);
  if (!den) return null;
  const fps = num / den;
  return `${fps.toFixed(2).replace(/\.?0+$/, "")} fps`;
}

function extractHashtags(text?: string): string[] | undefined {
  if (!text) return undefined;
  const matches = text.match(/#[\w\u00C0-\u024F]+/g);
  if (!matches || !matches.length) return undefined;
  // Dedupe + cap.
  return Array.from(new Set(matches)).slice(0, 12);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function guessMime(ext?: string): string | null {
  if (!ext) return null;
  const e = ext.toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    mkv: "video/x-matroska",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
  };
  return map[e] || null;
}

/* ---------- ffprobe ---------- */

function ffprobe(filePath: string, timeoutMs = 20_000): Promise<any> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      FFPROBE,
      [
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        filePath,
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer: NodeJS.Timeout | null = null;

    const finish = (err: Error | null, out?: any) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (err) reject(err);
      else resolve(out);
    };

    proc.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
    proc.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
    proc.on("error", (err) => finish(err));
    proc.on("close", (code) => {
      if (code !== 0) {
        finish(new Error(`ffprobe exited ${code}: ${stderr.slice(-200)}`));
        return;
      }
      try {
        finish(null, JSON.parse(stdout));
      } catch (e) {
        finish(e as Error);
      }
    });

    timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      finish(new Error("ffprobe timed out"));
    }, timeoutMs);
  });
}

/* ---------- exif ---------- */

const EXIF_TAG_KEYS = new Set([
  "Make",
  "Model",
  "LensModel",
  "LensID",
  "ISO",
  "ExposureTime",
  "ShutterSpeed",
  "FNumber",
  "Aperture",
  "DateTimeOriginal",
  "CreateDate",
  "GPSLatitude",
  "GPSLongitude",
  "GPSPosition",
  "Software",
  "Orientation",
  "CameraOrientation",
  "ColorSpace",
  "WhiteBalance",
  "FocalLength",
  "ExifVersion",
]);

function hasExifTags(tags: any): boolean {
  if (!tags || typeof tags !== "object") return false;
  for (const k of Object.keys(tags)) {
    if (EXIF_TAG_KEYS.has(k)) {
      const v = tags[k];
      if (v != null && v !== "" && v !== "undef") return true;
    }
  }
  return false;
}

function isHDRStream(vStream: any): boolean {
  if (!vStream) return false;
  const transfer = (vStream.color_transfer || "").toLowerCase();
  const primaries = (vStream.color_primaries || "").toLowerCase();
  return (
    transfer.includes("smpte2084") ||
    transfer.includes("arib-std-b67") ||
    primaries.includes("bt2020") ||
    vStream.profile === "High 10" ||
    !!vStream.side_data_list?.find(
      (s: any) => s.side_data_type === "Mastering display metadata"
    )
  );
}

function getRotation(vStream: any): number | null {
  const sd = vStream?.side_data_list;
  if (Array.isArray(sd)) {
    for (const s of sd) {
      if (s && typeof s.rotation === "number" && s.rotation !== 0) {
        return Math.round(s.rotation);
      }
    }
  }
  return null;
}

/* ---------- social group ---------- */

export function buildSocialGroupFromExtract(
  raw: RawExtract,
  platform: PlatformId
): MetaGroup {
  const platformLabel =
    platform === "unknown" ? "Unknown" : capitalize(platform);
  const fields: MetaField[] = [
    {
      key: "platform",
      label: "Platform",
      value: platformLabel,
    },
    {
      key: "caption",
      label: "Caption",
      value: raw.description || raw.title || null,
    },
    {
      key: "uploaddate",
      label: "Upload Date",
      value: raw.uploadDate || null,
    },
    {
      key: "username",
      label: "Username",
      value: raw.uploader || raw.creator || null,
    },
    {
      key: "likes",
      label: "Likes",
      value: raw.likeCount != null ? formatCount(raw.likeCount) : null,
    },
    {
      key: "comments",
      label: "Comments",
      value: raw.commentCount != null ? formatCount(raw.commentCount) : null,
    },
    {
      key: "hashtags",
      label: "Hashtags",
      value: extractHashtags(raw.description)?.join(" ") || null,
    },
    {
      key: "thumbnail",
      label: "Thumbnail",
      value: raw.thumbnail ? "Available" : null,
    },
  ];
  return { id: "social", label: "Social", fields };
}

/* ---------- analyze path: build groups from extract (no file yet) ---------- */

/**
 * Build MetaGroup[] directly from the yt-dlp extract - used by the analyze
 * route so we don't have to download the file. Image/video group fields are
 * "Not Present" where unknown, null where inapplicable.
 */
export function buildMetadataFromExtract(
  raw: RawExtract,
  platform: PlatformId,
  bestFormat?: RawFormat
): MetaGroup[] {
  const width = bestFormat?.width || raw.width;
  const height = bestFormat?.height || raw.height;
  const filesize = bestFormat?.filesize || raw.filesize;
  const vcodec = bestFormat?.vcodec;
  const acodec = bestFormat?.acodec;
  const fps = bestFormat?.fps;
  const tbr = bestFormat?.tbr;
  const abr = bestFormat?.abr;

  // Determine media kind for metadata grouping.
  const hasVideoCodec = !!vcodec && vcodec !== "none";
  const hasAudioCodec = !!acodec && acodec !== "none";
  const isMusicPlatform =
    platform === "youtube-music" ||
    platform === "soundcloud" ||
    platform === "spotify" ||
    platform === "apple-music";
  // Audio-only: has audio but no video stream, OR it's a known music platform
  // without a video codec.
  const isAudio =
    (hasAudioCodec && !hasVideoCodec) || (isMusicPlatform && !hasVideoCodec);
  const isVideo = !isAudio && (raw.isVideo !== false && (!!raw.duration || !!vcodec));
  const isImage = !isVideo && !isAudio;
  const ext =
    bestFormat?.ext || raw.ext || (isAudio ? "m4a" : isVideo ? "mp4" : "jpg");

  const fileGroup: MetaGroup = {
    id: "file",
    label: "File",
    fields: [
      { key: "filename", label: "Filename", value: null },
      { key: "ext", label: "Extension", value: ext || null },
      {
        key: "mime",
        label: "MIME Type",
        value: guessMime(ext) || (isAudio ? "audio/mp4" : isVideo ? "video/mp4" : "image/jpeg"),
      },
      {
        key: "resolution",
        label: "Resolution",
        value: isAudio ? null : height ? `${width}×${height}` : null,
      },
      {
        key: "size",
        label: "Size",
        value: filesize ? humanFileSize(filesize) : null,
      },
      {
        key: "dimensions",
        label: "Dimensions",
        value: isAudio ? null : width && height ? `${width} × ${height} px` : null,
      },
      {
        key: "bitrate",
        label: "Bitrate",
        value: tbr ? humanBitrate(tbr) : abr ? humanBitrate(abr) : null,
      },
      {
        key: "framerate",
        label: "Frame Rate",
        value: isAudio ? null : fps ? `${Math.round(fps)} fps` : null,
      },
      {
        key: "codec",
        label: "Codec",
        value: isAudio ? (acodec && acodec !== "none" ? acodec : null) : vcodec && vcodec !== "none" ? vcodec : null,
      },
      { key: "colorspace", label: "Color Space", value: isAudio ? null : null },
      { key: "container", label: "Container", value: ext || null },
      {
        key: "aspect",
        label: "Aspect Ratio",
        value: isAudio ? null : simplifyRatio(width, height),
      },
    ],
  };

  // For analyze path, we don't have an actual file, so image group is
  // "Not Present" if image, else null.
  const imageGroup: MetaGroup = {
    id: "image",
    label: "Image",
    fields: IMAGE_FIELDS.map(({ key, label }) => ({
      key,
      label,
      value: isImage ? "Not Present" : null,
    })),
  };

  const videoGroup: MetaGroup = {
    id: "video",
    label: "Video",
    fields: [
      {
        key: "vcodec",
        label: "Video Codec",
        value: isVideo
          ? vcodec && vcodec !== "none"
            ? vcodec
            : "Not Present"
          : null,
      },
      {
        key: "acodec",
        label: "Audio Codec",
        value: isVideo
          ? acodec && acodec !== "none"
            ? acodec
            : "Not Present"
          : null,
      },
      {
        key: "channels",
        label: "Channels",
        value: isVideo ? "Not Present" : null,
      },
      {
        key: "samplerate",
        label: "Sample Rate",
        value: isVideo ? "Not Present" : null,
      },
      { key: "hdr", label: "HDR", value: isVideo ? "Not Present" : null },
      {
        key: "rotation",
        label: "Rotation",
        value: isVideo ? "Not Present" : null,
      },
      {
        key: "bitrate",
        label: "Bitrate",
        value: isVideo
          ? tbr
            ? humanBitrate(tbr)
            : "Not Present"
          : null,
      },
      {
        key: "container",
        label: "Container",
        value: isVideo ? ext || "Not Present" : null,
      },
    ],
  };

  // Audio group - shown for audio-only sources (music tracks, podcasts).
  const audioGroup: MetaGroup = {
    id: "audio",
    label: "Audio",
    fields: [
      {
        key: "acodec",
        label: "Audio Codec",
        value: isAudio
          ? acodec && acodec !== "none"
            ? acodec
            : "Not Present"
          : null,
      },
      {
        key: "channels",
        label: "Channels",
        value: isAudio ? "Not Present" : null,
      },
      {
        key: "samplerate",
        label: "Sample Rate",
        value: isAudio ? "Not Present" : null,
      },
      {
        key: "bitrate",
        label: "Bitrate",
        value: isAudio
          ? abr
            ? humanBitrate(abr)
            : tbr
              ? humanBitrate(tbr)
              : "Not Present"
          : null,
      },
      {
        key: "duration",
        label: "Duration",
        value: isAudio
          ? raw.duration
            ? formatDuration(raw.duration)
            : "Not Present"
          : null,
      },
      {
        key: "container",
        label: "Container",
        value: isAudio ? ext || "Not Present" : null,
      },
      {
        key: "artist",
        label: "Artist",
        value: isAudio ? raw.creator || raw.uploader || "Not Present" : null,
      },
      {
        key: "album",
        label: "Album",
        value: isAudio ? "Not Present" : null,
      },
      {
        key: "genre",
        label: "Genre",
        value: isAudio ? "Not Present" : null,
      },
      {
        key: "track",
        label: "Track Number",
        value: isAudio ? "Not Present" : null,
      },
    ],
  };

  const socialGroup = buildSocialGroupFromExtract(raw, platform);

  return [fileGroup, imageGroup, videoGroup, audioGroup, socialGroup];
}

/* ---------- metadata path: build groups from a real downloaded file ---------- */

/**
 * Build MetaGroup[] from a local file using exiftool + ffprobe + sharp.
 * Used by the /api/metadata route after downloading the source file.
 */
export async function buildMetadataForFile(
  filePath: string,
  opts: { platform?: PlatformId; raw?: RawExtract } = {}
): Promise<MetaGroup[]> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  const platform = opts.platform ?? "unknown";

  const stat = await fs.stat(filePath).catch(() => null);
  const size = stat?.size;
  const filename = path.basename(filePath);
  const ext = path.extname(filePath).slice(1).toLowerCase();

  let probe: any = null;
  try {
    probe = await ffprobe(filePath);
  } catch {
    probe = null;
  }

  let tags: any = null;
  try {
    tags = await exiftool.read(filePath);
  } catch {
    tags = null;
  }

  let imgMeta: sharp.Metadata | null = null;
  try {
    imgMeta = await sharp(filePath).metadata();
  } catch {
    imgMeta = null;
  }

  const vStream = probe?.streams?.find((s: any) => s.codec_type === "video");
  const aStream = probe?.streams?.find((s: any) => s.codec_type === "audio");

  const mime =
    tags?.MIMEType ||
    (vStream ? "video/mp4" : imgMeta?.format ? `image/${imgMeta.format}` : null) ||
    guessMime(ext);

  const isImage =
    (typeof mime === "string" && mime.startsWith("image/")) ||
    (!probe && !!imgMeta);
  const isVideo =
    (typeof mime === "string" && mime.startsWith("video/")) ||
    (!!probe && !!vStream);

  const width =
    pickNum(vStream?.width, imgMeta?.width, opts.raw?.width) || undefined;
  const height =
    pickNum(vStream?.height, imgMeta?.height, opts.raw?.height) || undefined;

  const rotation = getRotation(vStream);

  // ---- file group ----
  const fileGroup: MetaGroup = {
    id: "file",
    label: "File",
    fields: [
      { key: "filename", label: "Filename", value: filename },
      { key: "ext", label: "Extension", value: ext || null },
      { key: "mime", label: "MIME Type", value: mime || null },
      {
        key: "resolution",
        label: "Resolution",
        value: height ? `${width}×${height}` : null,
      },
      {
        key: "size",
        label: "Size",
        value: size ? humanFileSize(size) : null,
      },
      {
        key: "dimensions",
        label: "Dimensions",
        value: width && height ? `${width} × ${height} px` : null,
      },
      {
        key: "bitrate",
        label: "Bitrate",
        value: probe?.format?.bit_rate
          ? humanBitrate(Number(probe.format.bit_rate) / 1000)
          : null,
      },
      {
        key: "framerate",
        label: "Frame Rate",
        value: vStream ? evalFps(vStream.avg_frame_rate) || evalFps(vStream.r_frame_rate) : null,
      },
      {
        key: "codec",
        label: "Codec",
        value: vStream?.codec_name || imgMeta?.format || null,
      },
      {
        key: "colorspace",
        label: "Color Space",
        value:
          vStream?.color_space ||
          tags?.ColorSpace ||
          (imgMeta?.space as string) ||
          null,
      },
      {
        key: "container",
        label: "Container",
        value: probe?.format?.format_long_name || ext || null,
      },
      {
        key: "aspect",
        label: "Aspect Ratio",
        value: simplifyRatio(width, height),
      },
    ],
  };

  // ---- image group ----
  const gpsVal =
    tags?.GPSLatitude != null && tags?.GPSLongitude != null
      ? `${tags.GPSLatitude}, ${tags.GPSLongitude}`
      : tags?.GPSPosition || null;

  const imageGroup: MetaGroup = {
    id: "image",
    label: "Image",
    fields: [
      {
        key: "exif",
        label: "EXIF",
        value: isImage ? (hasExifTags(tags) ? "Present" : "Not Present") : null,
      },
      { key: "gps", label: "GPS", value: isImage ? gpsVal || "Not Present" : null },
      {
        key: "make",
        label: "Camera Make",
        value: isImage ? tags?.Make || "Not Present" : null,
      },
      {
        key: "model",
        label: "Camera Model",
        value: isImage ? tags?.Model || "Not Present" : null,
      },
      {
        key: "lens",
        label: "Lens",
        value: isImage ? tags?.LensModel || tags?.LensID || "Not Present" : null,
      },
      {
        key: "iso",
        label: "ISO",
        value: isImage ? (tags?.ISO ? String(tags.ISO) : "Not Present") : null,
      },
      {
        key: "exposure",
        label: "Exposure",
        value: isImage
          ? tags?.ExposureTime
            ? formatExposure(tags.ExposureTime)
            : "Not Present"
          : null,
      },
      {
        key: "timestamp",
        label: "Timestamp",
        value: isImage
          ? tags?.DateTimeOriginal || tags?.CreateDate || "Not Present"
          : null,
      },
      {
        key: "icc",
        label: "ICC Profile",
        value: isImage
          ? imgMeta?.icc
            ? "Present"
            : "Not Present"
          : null,
      },
      {
        key: "software",
        label: "Software",
        value: isImage ? tags?.Software || "Not Present" : null,
      },
      {
        key: "orientation",
        label: "Orientation",
        value: isImage
          ? tags?.Orientation
            ? String(tags.Orientation)
            : imgMeta?.orientation
              ? String(imgMeta.orientation)
              : "Not Present"
          : null,
      },
    ],
  };

  // ---- video group ----
  const videoGroup: MetaGroup = {
    id: "video",
    label: "Video",
    fields: [
      {
        key: "vcodec",
        label: "Video Codec",
        value: isVideo
          ? vStream?.codec_long_name ||
            vStream?.codec_name ||
            "Not Present"
          : null,
      },
      {
        key: "acodec",
        label: "Audio Codec",
        value: isVideo
          ? aStream?.codec_long_name ||
            aStream?.codec_name ||
            "Not Present"
          : null,
      },
      {
        key: "channels",
        label: "Channels",
        value: isVideo
          ? aStream?.channels
            ? `${aStream.channels} ch`
            : "Not Present"
          : null,
      },
      {
        key: "samplerate",
        label: "Sample Rate",
        value: isVideo
          ? aStream?.sample_rate
            ? `${aStream.sample_rate} Hz`
            : "Not Present"
          : null,
      },
      {
        key: "hdr",
        label: "HDR",
        value: isVideo ? (isHDRStream(vStream) ? "Yes" : "Not Present") : null,
      },
      {
        key: "rotation",
        label: "Rotation",
        value: isVideo ? (rotation != null ? `${rotation}°` : "Not Present") : null,
      },
      {
        key: "bitrate",
        label: "Bitrate",
        value: isVideo
          ? probe?.format?.bit_rate
            ? humanBitrate(Number(probe.format.bit_rate) / 1000)
            : vStream?.bit_rate
              ? humanBitrate(Number(vStream.bit_rate) / 1000)
              : "Not Present"
          : null,
      },
      {
        key: "container",
        label: "Container",
        value: isVideo
          ? probe?.format?.format_long_name || ext || "Not Present"
          : null,
      },
    ],
  };

  // ---- social group ----
  const socialGroup = opts.raw
    ? buildSocialGroupFromExtract(opts.raw, platform)
    : {
        id: "social" as const,
        label: "Social",
        fields: [
          {
            key: "platform",
            label: "Platform",
            value: platform === "unknown" ? "Unknown" : capitalize(platform),
          },
          { key: "caption", label: "Caption", value: null },
          { key: "uploaddate", label: "Upload Date", value: null },
          { key: "username", label: "Username", value: null },
          { key: "likes", label: "Likes", value: null },
          { key: "comments", label: "Comments", value: null },
          { key: "hashtags", label: "Hashtags", value: null },
          { key: "thumbnail", label: "Thumbnail", value: null },
        ],
      };

  return [fileGroup, imageGroup, videoGroup, socialGroup];
}

/* ---------- small pick helpers ---------- */

function pickNum(...vals: any[]): number | null {
  for (const v of vals) {
    if (typeof v === "number" && isFinite(v) && v > 0) return v;
  }
  return null;
}

function formatExposure(v: any): string {
  if (typeof v === "number") {
    if (v <= 1) return `1/${Math.round(1 / v)}s`;
    return `${v}s`;
  }
  if (typeof v === "string") return v;
  return String(v);
}
