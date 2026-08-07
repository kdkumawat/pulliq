"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  FileBox,
  Image as ImageIcon,
  Video,
  Music,
  Share2,
  Check,
  Minus,
  ChevronDown,
} from "lucide-react";
import { usePulliqStore } from "@/store/pulliq-store";
import type { MetaGroup, MediaKind } from "@/lib/media/types";
import { cn } from "@/lib/utils";

const GROUP_META: Record<
  MetaGroup["id"],
  { icon: React.ElementType; color: string }
> = {
  file: { icon: FileBox, color: "var(--primary)" },
  image: { icon: ImageIcon, color: "var(--chart-3)" },
  video: { icon: Video, color: "var(--chart-2)" },
  audio: { icon: Music, color: "var(--chart-4)" },
  social: { icon: Share2, color: "var(--chart-5)" },
};

export function MetadataSidebar({
  layout = "stack",
}: {
  layout?: "stack" | "grid";
}) {
  const { result } = usePulliqStore();
  if (!result) return null;

  const kind: MediaKind = result.kind;
  const allGroups = result.metadata ?? [];

  // Count present fields per group.
  const counts = allGroups.map(
    (g) => g.fields.filter((f) => f.value != null && f.value !== "").length
  );

  // Filter groups: always show file + social. Show image XOR video XOR audio
  // based on the media kind. Hide groups with zero present fields.
  const visibleGroups = allGroups
    .map((g, i) => ({ group: g, present: counts[i], index: i }))
    .filter(({ group, present }) => {
      if (group.id === "file") return true; // always show file
      if (group.id === "social") return true; // always show social
      if (group.id === "image") return kind === "image" && present > 0;
      if (group.id === "video") return kind === "video" && present > 0;
      if (group.id === "audio") return kind === "audio" && present > 0;
      return present > 0;
    });

  const totalPresent = visibleGroups.reduce((a, x) => a + x.present, 0);

  if (layout === "grid") {
    return (
      <div className="grid gap-3 md:grid-cols-3">
        {visibleGroups.map(({ group, present, index }) => (
          <MetadataCard
            key={group.id}
            group={group}
            present={present}
            index={index}
            startOpen={group.id === "file"}
          />
        ))}
        {visibleGroups.length === 0 && (
          <div className="col-span-3 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No metadata detected for this media.
          </div>
        )}
      </div>
    );
  }

  // Stack layout (legacy/unused but kept for compatibility)
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold tracking-tight">Metadata</h2>
        <span className="text-xs text-muted-foreground">
          {totalPresent} fields detected
        </span>
      </div>
      {visibleGroups.map(({ group, present, index }) => (
        <MetadataCard
          key={group.id}
          group={group}
          present={present}
          index={index}
          startOpen={index < 2}
        />
      ))}
    </div>
  );
}

function MetadataCard({
  group,
  present,
  index,
  startOpen = false,
}: {
  group: MetaGroup;
  present: number;
  index: number;
  startOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(startOpen || present > 0);
  const meta = GROUP_META[group.id] ?? GROUP_META.file;
  const Icon = meta.icon;

  // Split fields into present and not-present.
  const presentFields = group.fields.filter((f) => f.value != null && f.value !== "");
  const absentFields = group.fields.filter((f) => f.value == null || f.value === "");

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="overflow-hidden rounded-2xl border border-border/70 bg-card"
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-accent/40"
      >
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{
              backgroundColor: `color-mix(in srgb, ${meta.color} 14%, transparent)`,
              color: meta.color,
            }}
          >
            <Icon className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold">{group.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
              present > 0
                ? "bg-success/10 text-success"
                : "bg-muted text-muted-foreground"
            )}
          >
            {present}/{group.fields.length}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        </div>
      </button>

      {open && (
        <div className="border-t border-border/60">
          <dl className="divide-y divide-border/40">
            {/* Present fields first */}
            {presentFields.map((f) => (
              <Field key={f.key} field={f} present />
            ))}
            {/* Collapsed absent fields */}
            {absentFields.length > 0 && <AbsentFields fields={absentFields} />}
          </dl>
        </div>
      )}
    </motion.div>
  );
}

function Field({
  field,
  present,
}: {
  field: { key: string; label: string; value: string | null };
  present: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2">
      <dt className="text-xs text-muted-foreground">{field.label}</dt>
      <dd className="flex min-w-0 items-center gap-1.5">
        {present ? (
          <>
            <span
              className="max-w-[180px] truncate text-xs font-medium text-foreground/90"
              title={field.value ?? ""}
            >
              {field.value}
            </span>
            <Check className="h-3.5 w-3.5 shrink-0 text-success" />
          </>
        ) : (
          <>
            <span className="text-xs italic text-muted-foreground/70">
              Not present
            </span>
            <Minus className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
          </>
        )}
      </dd>
    </div>
  );
}

function AbsentFields({
  fields,
}: {
  fields: { key: string; label: string; value: string | null }[];
}) {
  const [expanded, setExpanded] = React.useState(false);
  if (expanded) {
    return (
      <>
        {fields.map((f) => (
          <Field key={f.key} field={f} present={false} />
        ))}
      </>
    );
  }
  return (
    <button
      onClick={() => setExpanded(true)}
      className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left transition-colors hover:bg-accent/30"
    >
      <dt className="text-xs italic text-muted-foreground/60">
        {fields.length} not present
      </dt>
      <dd className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        Show all
        <ChevronDown className="h-3 w-3" />
      </dd>
    </button>
  );
}
