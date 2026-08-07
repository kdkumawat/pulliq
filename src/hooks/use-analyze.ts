"use client";

import { useQuery } from "@tanstack/react-query";
import type { AnalyzeResponse } from "@/lib/media/types";

export function useAnalyze(url: string, enabled: boolean) {
  return useQuery<AnalyzeResponse>({
    queryKey: ["analyze", url],
    queryFn: async ({ queryKey }) => {
      const [, u] = queryKey as [string, string];
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: u }),
      });
      if (!res.ok) {
        let msg = `Request failed (${res.status})`;
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      return (await res.json()) as AnalyzeResponse;
    },
    enabled: !!url && enabled,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });
}
