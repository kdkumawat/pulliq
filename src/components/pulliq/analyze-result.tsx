"use client";

import * as React from "react";
import { Info, ShieldCheck } from "lucide-react";
import { DownloadPanel } from "./download-panel";
import { MediaPreview } from "./media-preview";
import { MediaInfo } from "./media-info";
import { MetadataSidebar } from "./metadata-sidebar";
import { usePulliqStore } from "@/store/pulliq-store";

export function AnalyzeResult() {
  const { result } = usePulliqStore();
  const note = result?.note;
  return (
    <div className="space-y-5">
      {/* Honest note when extraction degraded (e.g. only a preview thumbnail was found) */}
      {note && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{note}</span>
        </div>
      )}

      {/* Row 1: Preview (left) + Download (right) - the main goal, side by side */}
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <MediaPreview />
        <DownloadPanel />
      </div>

      {/* Row 2: Media info (title, creator, stats, engagement) */}
      <MediaInfo />

      {/* Row 3: Metadata - 3 columns (file | video-or-image | social) */}
      <MetadataSection />

      {/* Row 4: Privacy note */}
      <PrivacyNote />
    </div>
  );
}

function MetadataSection() {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-base font-semibold tracking-tight">Metadata</h2>
        <span className="text-xs text-muted-foreground">
          Every field shown as Present or Not Present
        </span>
      </div>
      <MetadataSidebar layout="grid" />
    </section>
  );
}

function PrivacyNote() {
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-border/60 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
      <span>
        Use the <span className="font-medium text-foreground/90">Without metadata</span> toggle
        in the download panel to strip GPS, EXIF, camera, and other identifying data before saving.
      </span>
    </div>
  );
}
