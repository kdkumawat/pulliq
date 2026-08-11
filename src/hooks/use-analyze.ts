"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import type { AnalyzeResponse } from "@/lib/media/types";

export interface AnalyzeProgress {
  pct: number;
  stage: string;
}

export function useAnalyze(url: string, enabled: boolean) {
  const [progress, setProgress] = React.useState<AnalyzeProgress | null>(null);

  const query = useQuery<AnalyzeResponse>({
    queryKey: ["analyze", url],
    queryFn: async ({ queryKey, signal }) => {
      const [, u] = queryKey as [string, string];
      setProgress({ pct: 3, stage: "Starting" });

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: u }),
        signal,
      });

      const contentType = res.headers.get("content-type") ?? "";

      // Early errors (rate limit, invalid URL, DRM, SSRF) come as plain JSON.
      if (!contentType.includes("ndjson")) {
        let j: { ok?: boolean; error?: string } | null = null;
        try {
          j = await res.json();
        } catch {
          j = null;
        }
        if (!res.ok || j?.ok === false) {
          throw new Error(j?.error ?? `Request failed (${res.status})`);
        }
        setProgress(null);
        return j as unknown as AnalyzeResponse;
      }

      // Progress stream: {"type":"progress","pct":..,"stage":".."} lines,
      // ending with {"type":"result","data":...} or {"type":"error",...}.
      const reader = res.body?.getReader();
      if (!reader) throw new Error("Empty response from server");
      const decoder = new TextDecoder();
      let buffer = "";
      let result: AnalyzeResponse | null = null;
      let failure: Error | null = null;

      try {
        while (true) {
          if (signal?.aborted) {
            throw new DOMException("Aborted", "AbortError");
          }
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            let ev: { type?: string; pct?: number; stage?: string; data?: unknown; error?: string };
            try {
              ev = JSON.parse(trimmed);
            } catch {
              continue;
            }
            if (ev.type === "progress") {
              setProgress({ pct: Number(ev.pct) || 0, stage: ev.stage ?? "" });
            } else if (ev.type === "result" && ev.data) {
              result = ev.data as AnalyzeResponse;
            } else if (ev.type === "error") {
              failure = new Error(ev.error ?? "Analysis failed");
            }
          }
        }
      } finally {
        setProgress(null);
      }

      if (failure) throw failure;
      if (!result) throw new Error("No result from server");
      return result;
    },
    enabled: !!url && enabled,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });

  return { ...query, progress };
}
