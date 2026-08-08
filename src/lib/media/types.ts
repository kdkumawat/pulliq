// Shared types for Pulliq - used by frontend and backend.

export type PlatformId =
  | "instagram"
  | "tiktok"
  | "x"
  | "threads"
  | "linkedin"
  | "pinterest"
  | "facebook"
  | "reddit"
  | "vimeo"
  | "dailymotion"
  | "youtube"
  | "youtube-music"
  | "soundcloud"
  | "spotify"
  | "apple-music"
  | "unknown";

export type MediaKind = "video" | "image" | "audio" | "carousel" | "unknown";

export interface MediaFormat {
  id: string;
  label: string; // "Original", "1080p", "720p", "480p", "MP3"
  quality: string;
  ext: string; // "mp4", "mp3", "jpg"
  kind: "video" | "audio" | "image";
  /** Approximate file size in bytes, if known. */
  filesize?: number;
  /** Pixel height of the video/frame, if applicable. */
  height?: number;
  /** Pixel width, if applicable. */
  width?: number;
  /** Direct media url resolved by backend (not exposed to client). */
  url?: string;
  /** True when this is the source/original rendition. */
  isOriginal?: boolean;
  note?: string;
}

export interface CarouselItem {
  id: string;
  kind: "image" | "video";
  url?: string;
  thumbnail: string;
  title?: string;
  width?: number;
  height?: number;
}

/** A single metadata field with presence + value. */
export interface MetaField {
  key: string;
  label: string;
  value: string | null; // null => Not Present
}

export interface MetaGroup {
  id: "file" | "image" | "video" | "audio" | "social";
  label: string;
  fields: MetaField[];
}

export interface AnalyzeResponse {
  ok: boolean;
  platform: PlatformId;
  platformLabel: string;
  kind: MediaKind;
  title: string;
  creator: string;
  thumbnail: string;
  duration?: number; // seconds
  width?: number;
  height?: number;
  filesize?: number;
  url: string;
  /** Direct, playable media URL (best progressive format) for in-browser playback. */
  mediaUrl?: string;
  formats: MediaFormat[];
  carousel?: CarouselItem[];
  metadata: MetaGroup[];
  social: {
    caption?: string;
    uploadDate?: string;
    username?: string;
    likes?: number;
    comments?: number;
    hashtags?: string[];
    thumbnail?: string;
    platform: PlatformId;
  };
  /** True when the data came from a graceful fallback (e.g. extraction failed). */
  demo?: boolean;
  note?: string;
  /** Server processing time in ms. */
  tookMs?: number;
}

export interface AnalyzeRequest {
  url: string;
}

export interface MetadataResponse {
  ok: boolean;
  groups: MetaGroup[];
  privacyRemovable: string[]; // field keys that can be stripped
}

export interface DownloadRequest {
  url: string;
  format: string; // format id
  clean?: boolean;
  /** Direct media URL from analyze - used for original downloads when yt-dlp is unreliable. */
  mediaUrl?: string;
}

export interface PlatformInfo {
  id: PlatformId;
  name: string;
  slug: string; // seo slug
  color: string;
  domain: string;
}

export type ViewName = "landing" | "analyze";
