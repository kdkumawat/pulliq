"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Play,
  ImageIcon,
  Film,
  Layers,
  AlertCircle,
  Loader2,
  RefreshCw,
  Music,
  Download,
} from "lucide-react";
import { usePulliqStore } from "@/store/pulliq-store";
import { PlatformIcon } from "./platform-icon";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function MediaPreview() {
  const { result } = usePulliqStore();
  if (!result) return null;
  const { kind, thumbnail, title, carousel } = result;

  if (kind === "carousel" && carousel && carousel.length > 0) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.99 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="overflow-hidden rounded-3xl border border-border/70 bg-card"
      >
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Layers className="h-4 w-4 text-primary" /> Carousel
            <Badge variant="secondary" className="rounded-full">
              {carousel.length} items
            </Badge>
          </div>
        </div>
        <Carousel opts={{ align: "start", loop: carousel.length > 2 }} className="w-full">
          <CarouselContent>
            {carousel.map((item, i) => (
              <CarouselItem key={item.id} className="basis-3/4 sm:basis-1/2">
                <div className="group relative aspect-square overflow-hidden rounded-2xl bg-muted">
                  <img
                    src={item.thumbnail}
                    alt={item.title ?? `Slide ${i + 1}`}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                  {item.kind === "video" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55 backdrop-blur">
                        <Play className="h-5 w-5 fill-white text-white" />
                      </div>
                    </div>
                  )}
                  <div className="absolute bottom-2 left-2">
                    <Badge className="rounded-full bg-black/55 text-white hover:bg-black/55">
                      {i + 1} / {carousel.length}
                    </Badge>
                  </div>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="left-2" />
          <CarouselNext className="right-2" />
        </Carousel>
      </motion.div>
    );
  }

  // Unknown kind with a playable mediaUrl is still a video - try playback
  // instead of rendering a static thumbnail (a common cause of "video shown
  // as image" reports).
  const isVideo = kind === "video" || (kind === "unknown" && !!result.mediaUrl);
  const isAudio = kind === "audio";
  const isImage = kind === "image";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.99 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="group relative overflow-hidden rounded-3xl border border-border/70 bg-card"
    >
      <div className="relative flex aspect-video items-center justify-center bg-black/[0.03] dark:bg-white/[0.02]">
        {isVideo ? (
          <VideoPlayer thumbnail={thumbnail} title={title} />
        ) : isAudio ? (
          <AudioPlayer thumbnail={thumbnail} title={title} />
        ) : thumbnail ? (
          // Show the full original image - no cropping (object-contain).
          <img
            src={thumbnail}
            alt={title}
            className="h-full w-full object-contain"
            loading="eager"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-muted-foreground/50">
              <ImageIcon className="h-10 w-10" />
              <span className="text-xs">No preview available</span>
            </div>
          </div>
        )}

        {/* Top-left platform chip */}
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
          <PlatformIcon
            platform={result.platform}
            className="h-4 w-4 text-[9px]"
            withRing
          />
          {result.platformLabel}
        </div>

        {/* Top-right kind chip */}
        <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
          {isVideo ? (
            <>
              <Film className="h-3.5 w-3.5" /> Video
            </>
          ) : isImage ? (
            <>
              <ImageIcon className="h-3.5 w-3.5" /> Image
            </>
          ) : isAudio ? (
            <>
              <Music className="h-3.5 w-3.5" /> Audio
            </>
          ) : (
            <>
              <Layers className="h-3.5 w-3.5" /> Media
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* --------------------------- Audio player --------------------------- */

/**
 * Ordered playback URLs (progressive first, then HLS/alternates) mapped to
 * the stream proxy. The browser tries each <source> in order and falls back
 * automatically when one fails, so a blocked CDN never dead-ends playback.
 */
function usePlaybackSources(): string[] {
  const { result } = usePulliqStore();
  return React.useMemo(() => {
    const urls = [result?.mediaUrl, ...(result?.mediaUrls ?? [])].filter(
      (u): u is string => !!u
    );
    return [...new Set(urls)].map((u) => `/api/stream?u=${encodeURIComponent(u)}`);
  }, [result?.mediaUrl, result?.mediaUrls]);
}

function AudioPlayer({ thumbnail, title }: { thumbnail: string; title: string }) {
  const sources = usePlaybackSources();
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [state, setState] = React.useState<"loading" | "ready" | "error">(
    sources.length ? "loading" : "error"
  );
  const [attempt, setAttempt] = React.useState(0);

  const retry = () => {
    if (!sources.length) return;
    setState("loading");
    // Remount via key re-runs the resource selection with the same sources.
    setAttempt((a) => a + 1);
  };

  if (!sources.length) {
    return (
      <div className="relative flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
        {thumbnail && (
          <img
            src={thumbnail}
            alt={title}
            className="absolute inset-0 h-full w-full object-cover opacity-20"
          />
        )}
        <Music className="relative h-8 w-8 text-muted-foreground/60" />
        <p className="relative text-xs text-muted-foreground">
          Preview unavailable. Download below.
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-4 p-6">
      {/* Album art backdrop */}
      {thumbnail && (
        <img
          src={thumbnail}
          alt={title}
          className="absolute inset-0 h-full w-full object-cover opacity-20"
        />
      )}
      <div className="relative flex flex-col items-center gap-4">
        <div className="relative">
          {thumbnail && (
            <img
              src={thumbnail}
              alt={title}
              className="h-28 w-28 rounded-2xl object-cover shadow-lg sm:h-32 sm:w-32"
            />
          )}
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/30">
            <Music className="h-8 w-8 text-white" />
          </div>
        </div>
        <audio
          ref={audioRef}
          key={`${attempt}-${sources.length}`}
          controls
          preload="metadata"
          className="relative w-full max-w-xs"
          onCanPlay={() => setState("ready")}
          onLoadedData={() => setState("ready")}
          // Fires only when every <source> failed - fallback is automatic.
          onError={() => setState("error")}
        >
          {sources.map((s) => (
            <source key={s} src={s} />
          ))}
        </audio>
        {state === "error" && (
          <div className="relative flex flex-col items-center gap-2 text-center">
            <p className="text-xs text-muted-foreground">
              Preview unavailable. Download below.
            </p>
            <Button size="sm" variant="outline" onClick={retry}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------- Video player --------------------------- */

/** Platforms that commonly block automated playback from a proxy. */
const BLOCKY_PLAYBACK = new Set([
  "x",
  "facebook",
  "instagram",
  "tiktok",
  "threads",
  "soundcloud",
  "vimeo",
]);

function playbackHint(platform: string): string {
  if (BLOCKY_PLAYBACK.has(platform)) {
    return "This platform often blocks playback from other sites. The download may still work.";
  }
  return "";
}

function VideoPlayer({ thumbnail, title }: { thumbnail: string; title: string }) {
  const { result } = usePulliqStore();
  const sources = usePlaybackSources();
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [state, setState] = React.useState<"loading" | "ready" | "error">(
    sources.length ? "loading" : "error"
  );
  const [attempt, setAttempt] = React.useState(0);

  const retry = () => {
    if (!videoRef.current || !sources.length) return;
    setState("loading");
    // Force reload by re-mounting the element via key.
    setAttempt((a) => a + 1);
  };

  if (!sources.length) {
    return (
      <PreviewUnavailable
        thumbnail={thumbnail}
        title={title}
        message="This video can't be previewed here, but you can still download it."
      />
    );
  }

  return (
    <div className="relative h-full w-full">
      <video
        ref={videoRef}
        key={`${attempt}-${sources.length}`}
        className="h-full w-full bg-black object-contain"
        poster={thumbnail}
        controls
        playsInline
        preload="auto"
        onLoadedData={() => setState("ready")}
        onCanPlay={() => setState("ready")}
        // Fires only after every <source> failed - the browser falls back
        // to the next source automatically on per-source errors.
        onError={() => setState("error")}
      >
        {sources.map((s) => (
          <source key={s} src={s} />
        ))}
      </video>

      {/* Loading overlay */}
      {state === "loading" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="flex items-center gap-2 rounded-full bg-black/60 px-3.5 py-1.5 text-xs font-medium text-white backdrop-blur">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading video
          </div>
        </div>
      )}

      {/* Error overlay with retry */}
      {state === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 p-6 text-center backdrop-blur-sm">
          <img
            src={thumbnail}
            alt={title}
            className="absolute inset-0 h-full w-full object-contain opacity-25"
          />
          <div className="relative flex flex-col items-center gap-2.5 rounded-2xl bg-background/90 px-6 py-5">
            <AlertCircle className="h-7 w-7 text-muted-foreground" />
            <p className="text-sm font-semibold">Preview failed</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              The video couldn&apos;t load for playback. You can still download it.
            </p>
            {playbackHint(result.platform) && (
              <p className="max-w-xs text-xs text-muted-foreground/80">
                {playbackHint(result.platform)}
              </p>
            )}
            <div className="mt-1 flex gap-2">
              <Button size="sm" variant="default" onClick={retry}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const el = document.getElementById("download-action");
                  el?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" /> Download
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewUnavailable({
  thumbnail,
  title,
  message,
}: {
  thumbnail: string;
  title: string;
  message: string;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
      {thumbnail && (
        <img
          src={thumbnail}
          alt={title}
          className="absolute inset-0 h-full w-full object-contain opacity-40"
        />
      )}
      <div className="relative flex flex-col items-center gap-2 rounded-2xl bg-background/80 px-5 py-4 backdrop-blur">
        <AlertCircle className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium">Preview not available</p>
        <p className="max-w-xs text-xs text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
