"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  ShieldOff,
  Check,
  MapPin,
  Camera,
  Cpu,
  User,
  MessageSquare,
  Clock,
  Download,
  Loader2,
  Info,
} from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { usePulliqStore } from "@/store/pulliq-store";
import { useDownload } from "@/hooks/use-download";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

const REMOVABLE = [
  { icon: MapPin, label: "GPS location" },
  { icon: Camera, label: "Camera & lens" },
  { icon: Cpu, label: "Software / device" },
  { icon: User, label: "Author / owner" },
  { icon: MessageSquare, label: "Comments" },
  { icon: Clock, label: "Timestamps" },
];

export function PrivacyPanel() {
  const { result } = usePulliqStore();
  const [mode, setMode] = React.useState<"original" | "clean">("clean");
  const { state, download, reset } = useDownload();
  const isImage = result?.kind === "image";

  const handleDownload = () => {
    // Clean copy downloads the original rendition with metadata stripped.
    download({ format: "original", clean: mode === "clean" });
  };

  const busy = state.status === "preparing" || state.status === "downloading";

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-card p-5 sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-success/10 blur-3xl" />

      <div className="relative flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-success/12 text-success">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-base font-semibold tracking-tight">Privacy</h3>
          <p className="text-xs text-muted-foreground">
            Choose what to keep before saving.
          </p>
        </div>
      </div>

      <RadioGroup
        value={mode}
        onValueChange={(v) => setMode(v as "original" | "clean")}
        className="mt-5 grid gap-2.5 sm:grid-cols-2"
      >
        <OptionCard
          value="original"
          selected={mode === "original"}
          icon={<ShieldOff className="h-4 w-4" />}
          title="Keep original"
          desc="Download the file exactly as it is, with all metadata intact."
        />
        <OptionCard
          value="clean"
          selected={mode === "clean"}
          icon={<ShieldCheck className="h-4 w-4" />}
          title="Remove metadata"
          desc="Strip identifying metadata and save a clean copy."
          badge="Recommended"
        />
      </RadioGroup>

      <AnimatePresence initial={false}>
        {mode === "clean" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="mt-4 rounded-2xl border border-success/20 bg-success/[0.05] p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-success">
                <Check className="h-3.5 w-3.5" /> Removes
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
                {REMOVABLE.map((r) => (
                  <div key={r.label} className="flex items-center gap-2 text-sm">
                    <r.icon className="h-3.5 w-3.5 text-success" />
                    <span className="text-foreground/90">{r.label}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                {isImage
                  ? "Images are re-encoded without EXIF/GPS/camera tags. Visual quality is preserved."
                  : "Videos are remuxed with container metadata and chapters removed. Visual & audio quality are preserved."}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status / action */}
      <div className="mt-5">
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
                {state.status === "preparing" ? "Preparing clean copy…" : "Downloading…"}
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
              <Check className="h-4 w-4" /> Saved <span className="font-medium">{state.filename}</span>
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
            variant={mode === "clean" ? "default" : "secondary"}
          >
            <Download className="mr-2 h-4 w-4" />
            {mode === "clean" ? "Download clean copy" : "Download original"}
          </Button>
        )}
      </div>
    </div>
  );
}

function OptionCard({
  value,
  selected,
  icon,
  title,
  desc,
  badge,
}: {
  value: string;
  selected: boolean;
  icon: React.ReactNode;
  title: string;
  desc: string;
  badge?: string;
}) {
  return (
    <Label
      htmlFor={`opt-${value}`}
      className={cn(
        "relative flex cursor-pointer flex-col gap-1.5 rounded-2xl border p-4 transition-all",
        selected
          ? "border-primary/50 bg-primary/[0.05] ring-2 ring-primary/10"
          : "border-border/70 bg-background/40 hover:border-border"
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg",
            selected ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground"
          )}
        >
          {icon}
        </span>
        <RadioGroupItem value={value} id={`opt-${value}`} className="sr-only" />
        <span
          className={cn(
            "flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors",
            selected ? "border-primary bg-primary" : "border-muted-foreground/40"
          )}
        >
          {selected && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">{title}</span>
        {badge && (
          <span className="rounded-full bg-success/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
            {badge}
          </span>
        )}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{desc}</p>
    </Label>
  );
}
