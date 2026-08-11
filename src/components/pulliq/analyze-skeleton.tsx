"use client";

import * as React from "react";
import { motion, AnimatePresence, useSpring, useTransform } from "framer-motion";
import { ScanSearch, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { AnalyzeProgress } from "@/hooks/use-analyze";

/**
 * Analyzing screen: a hero progress card with a real percentage (fed by
 * server-side progress events), followed by the skeleton preview layout.
 */
export function AnalyzeSkeleton({ progress }: { progress: AnalyzeProgress | null }) {
  const pct = progress?.pct ?? 0;
  const stage = progress?.stage ?? "Contacting server";

  // Spring-eased percentage so the number glides between server updates.
  const spring = useSpring(pct, { stiffness: 60, damping: 20, mass: 0.6 });
  const rounded = useTransform(spring, (v) => Math.round(v));
  const width = useTransform(spring, (v) => `${Math.max(4, v)}%`);

  React.useEffect(() => {
    spring.set(pct);
  }, [pct, spring]);

  return (
    <div className="space-y-5">
      {/* Progress hero card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative overflow-hidden rounded-3xl border border-border/70 bg-card p-6 sm:p-8"
      >
        <div className="pointer-events-none absolute -right-20 -top-24 h-60 w-60 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-52 w-52 rounded-full bg-chart-3/10 blur-3xl" />

        <div className="relative flex flex-col items-center text-center">
          {/* Pulsing scan badge */}
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ScanSearch className="h-7 w-7" />
            <span className="absolute -right-1 -top-1 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
            </span>
          </div>

          {/* Animated percentage */}
          <div className="mt-4 text-5xl font-semibold tabular-nums tracking-tight sm:text-6xl">
            <motion.span>{rounded}</motion.span>
            <span className="text-muted-foreground/60">%</span>
          </div>

          {/* Gradient progress bar with shimmer */}
          <div className="mt-5 h-2 w-full max-w-md overflow-hidden rounded-full bg-muted">
            <motion.div
              className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-primary via-chart-3 to-primary"
              style={{ width }}
            >
              <div className="shimmer absolute inset-0" />
            </motion.div>
          </div>

          {/* Stage label */}
          <div className="mt-3 flex min-h-[22px] items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary/70" />
            <AnimatePresence mode="wait">
              <motion.span
                key={stage}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.18 }}
              >
                {stage}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* Skeleton preview layout */}
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          <Skeleton className="aspect-video w-full rounded-3xl" />
          <div className="space-y-2.5">
            <Skeleton className="h-6 w-3/4 rounded-lg" />
            <div className="flex gap-2">
              <Skeleton className="h-4 w-24 rounded-full" />
              <Skeleton className="h-4 w-20 rounded-full" />
              <Skeleton className="h-4 w-16 rounded-full" />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-2xl" />
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border/60 p-4">
              <Skeleton className="h-5 w-28 rounded-lg" />
              <div className="mt-4 space-y-2.5">
                {Array.from({ length: 5 }).map((_, j) => (
                  <div key={j} className="flex justify-between">
                    <Skeleton className="h-4 w-24 rounded" />
                    <Skeleton className="h-4 w-20 rounded" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
