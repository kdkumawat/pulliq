"use client";

import * as React from "react";
import { Clock, Maximize, HardDrive, User, Calendar, Heart, MessageCircle, Hash } from "lucide-react";
import { usePulliqStore } from "@/store/pulliq-store";
import { formatDuration, formatBytes, formatCount, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export function MediaInfo() {
  const { result } = usePulliqStore();
  if (!result) return null;

  const { title, creator, platformLabel, duration, width, height, filesize, social } = result;
  const resolution = width && height ? `${width}×${height}` : undefined;

  const stats = [
    { icon: Clock, label: "Duration", value: formatDuration(duration) },
    { icon: Maximize, label: "Resolution", value: resolution },
    { icon: HardDrive, label: "File size", value: formatBytes(filesize) },
  ].filter((s) => s.value);

  return (
    <div className="rounded-3xl border border-border/70 bg-card p-5 sm:p-6">
      <h1 className="text-xl font-semibold leading-snug tracking-tight sm:text-2xl text-balance">
        {title}
      </h1>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
        {creator && (
          <span className="inline-flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" />
            <span className="font-medium text-foreground/90">{creator}</span>
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
          {platformLabel}
        </span>
        {social?.uploadDate && (
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            {formatDate(social.uploadDate)}
          </span>
        )}
      </div>

      {social?.caption && (
        <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
          {social.caption}
        </p>
      )}

      {stats.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-border/60 bg-background/50 px-3 py-2.5"
            >
              <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <s.icon className="h-3.5 w-3.5" />
                {s.label}
              </div>
              <div className="mt-1 text-sm font-semibold tabular-nums">{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Social engagement */}
      {(social?.likes != null || social?.comments != null || (social?.hashtags && social.hashtags.length > 0)) && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          {social?.likes != null && (
            <span className="inline-flex items-center gap-1.5">
              <Heart className="h-3.5 w-3.5 text-primary" />
              <span className="font-medium text-foreground/90">{formatCount(social.likes)}</span> likes
            </span>
          )}
          {social?.comments != null && (
            <span className="inline-flex items-center gap-1.5">
              <MessageCircle className="h-3.5 w-3.5" />
              <span className="font-medium text-foreground/90">{formatCount(social.comments)}</span> comments
            </span>
          )}
          {social?.hashtags && social.hashtags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {social.hashtags.slice(0, 4).map((h) => (
                <span
                  key={h}
                  className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground"
                >
                  <Hash className="h-2.5 w-2.5" />
                  {h.replace(/^#/, "")}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
