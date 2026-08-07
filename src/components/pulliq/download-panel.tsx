"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Download,
  Loader2,
  Check,
  Crown,
  Film,
  Music,
  FileVideo,
  Music2,
  ShieldOff,
  ShieldCheck,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePulliqStore } from "@/store/pulliq-store";
import { useDownload } from "@/hooks/use-download";
import { formatBytes } from "@/lib/format";
import type { MediaFormat } from "@/lib/media/types";
import { cn } from "@/lib/utils";

const FORMAT_ICON: Record<string, React.ElementType> = {
  original: Crown,
  "mp4-1080": FileVideo,
  "mp4-720": Film,
  "mp4-480": Film,
  "mp3-128": Music,
};

const REMOVABLE_ITEMS = [
  "GPS location",
  "EXIF data",
  "Camera & lens",
  "Software / device",
  "Author / owner",
  "Comments",
  "Timestamps",
];

export function DownloadPanel() {
  const { result } = usePulliqStore();
  const [selected, setSelected] = React.useState<string>("original");
  const [clean, setClean] = React.useState(true); // default: without metadata
  const { state, download, reset } = useDownload();

  React.useEffect(() => {
    const first = result?.formats?.[0]?.id ?? "original";
    setSelected(first);
  }, [result]);

  if (!result) return null;
  const formats = result.formats ?? [];
  const isImage = result.kind === "image";
  const isAudio = result.kind === "audio";
  const busy = state.status === "preparing" || state.status === "downloading";

  const handleDownload = () => {
    download({ format: selected, clean });
  };

  return (
    <div id="download-action" className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-border/70 bg-card p-5 sm:p-6">
      <div className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />

      <div className="relative flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/12 text-primary">
          <Download className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-base font-semibold tracking-tight">Download</h3>
          <p className="text-xs text-muted-foreground">
            {isImage
              ? "Save this image, clean or original."
              : isAudio
                ? "Save this track as MP3 or original."
                : "Pick a quality and download."}
          </p>
        </div>
      </div>

      {/* Format selection */}
      {isImage ? (
        <div className="relative mt-4 rounded-2xl border border-dashed border-border bg-background/40 p-4 text-center text-sm text-muted-foreground">
          Image format: {result.formats?.[0]?.ext?.toUpperCase() ?? "JPG"}
        </div>
      ) : (
        <div className="relative mt-4 space-y-2">
          {formats.map((f, i) => (
            <FormatRow
              key={f.id}
              fmt={f}
              selected={selected === f.id}
              onSelect={() => !busy && setSelected(f.id)}
              index={i}
              isFromVideo={!isAudio}
            />
          ))}
        </div>
      )}

      {/* Clean toggle */}
      <div className="relative mt-4">
        <CleanToggle clean={clean} onChange={setClean} disabled={busy} />
      </div>

      {/* Status / action */}
      <div className="relative mt-auto pt-5">
        {state.status === "error" ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
              {state.error}
            </div>
            <Button variant="outline" className="w-full" onClick={reset}>
              Dismiss
            </Button>
          </div>
        ) : busy ? (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {state.status === "preparing"
                  ? `Preparing${clean ? " clean copy" : ""}…`
                  : "Downloading…"}
              </span>
              {state.total > 0 && (
                <span className="tabular-nums">
                  {formatBytes(state.received)} / {formatBytes(state.total)}
                </span>
              )}
            </div>
            <Progress value={state.progress * 100} className="h-1.5" />
          </div>
        ) : state.status === "done" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/5 px-4 py-2.5 text-sm text-success">
              <Check className="h-4 w-4 shrink-0" />{" "}
              <span className="truncate">Saved {state.filename}</span>
            </div>
            <Button variant="outline" className="w-full" onClick={reset}>
              Done
            </Button>
          </div>
        ) : (
          <Button
            onClick={handleDownload}
            className="w-full"
            size="lg"
            disabled={busy}
          >
            <Download className="mr-2 h-4 w-4" />
            Download{clean ? " clean copy" : ""}
          </Button>
        )}
      </div>
    </div>
  );
}

function FormatRow({
  fmt,
  selected,
  onSelect,
  index,
  isFromVideo,
}: {
  fmt: MediaFormat;
  selected: boolean;
  onSelect: () => void;
  index: number;
  isFromVideo?: boolean;
}) {
  const Icon = FORMAT_ICON[fmt.id] ?? (fmt.kind === "audio" ? Music2 : FileVideo);
  const isAudioFmt = fmt.kind === "audio";
  return (
    <motion.button
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-all",
        selected
          ? "border-primary/50 bg-primary/[0.05] ring-2 ring-primary/10"
          : "border-border/70 bg-background/40 hover:border-border"
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
          selected
            ? isAudioFmt
              ? "bg-chart-4/12 text-chart-4"
              : "bg-primary/12 text-primary"
            : "bg-muted text-muted-foreground"
        )}
      >
        <Icon className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{fmt.label}</span>
          {fmt.isOriginal && (
            <Badge variant="secondary" className="rounded-full px-1.5 py-0 text-[10px]">
              Source
            </Badge>
          )}
          {isAudioFmt && isFromVideo && (
            <Badge
              className="rounded-full px-1.5 py-0 text-[10px] border-0"
              style={{ backgroundColor: "color-mix(in srgb, var(--chart-4) 14%, transparent)", color: "var(--chart-4)" }}
            >
              Extract audio
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="uppercase">{fmt.ext}</span>
          {fmt.height && <span>- {fmt.height}p</span>}
          {fmt.note && <span>- {fmt.note}</span>}
        </div>
      </div>

      <div className="text-right">
        {fmt.filesize ? (
          <div className="text-xs font-medium tabular-nums">{formatBytes(fmt.filesize)}</div>
        ) : (
          <div className="text-xs text-muted-foreground">Auto</div>
        )}
      </div>

      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"
        )}
      >
        {selected && <Check className="h-3 w-3" />}
      </span>
    </motion.button>
  );
}

function CleanToggle({
  clean,
  onChange,
  disabled,
}: {
  clean: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/40 p-3.5">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
              clean ? "bg-success/12 text-success" : "bg-muted text-muted-foreground"
            )}
          >
            {clean ? <ShieldCheck className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
          </span>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold">Without metadata</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="What gets removed"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[220px]">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-foreground">
                      Removes:
                    </p>
                    <ul className="space-y-0.5">
                      {REMOVABLE_ITEMS.map((item) => (
                        <li key={item} className="flex items-center gap-1.5 text-[11px]">
                          <Check className="h-2.5 w-2.5 text-success" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {clean ? "Strips identifying data" : "Keeps all metadata"}
            </p>
          </div>
        </div>

        {/* Toggle switch */}
        <button
          type="button"
          role="switch"
          aria-checked={clean}
          disabled={disabled}
          onClick={() => onChange(!clean)}
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full transition-colors",
            clean ? "bg-success" : "bg-muted-foreground/30",
            disabled && "opacity-50"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
              clean && "translate-x-5"
            )}
          />
        </button>
      </div>
    </TooltipProvider>
  );
}
