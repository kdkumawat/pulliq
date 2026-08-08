"use client";

import * as React from "react";
import { usePulliqStore } from "@/store/pulliq-store";
import type { AnalyzeResponse } from "@/lib/media/types";
import {
  trackDownloadError,
  trackDownloadStart,
  trackDownloadSuccess,
} from "@/lib/analytics";

export type DownloadStatus = "idle" | "preparing" | "downloading" | "done" | "error";

export interface DownloadState {
  status: DownloadStatus;
  progress: number; // 0..1 (estimated from content-length)
  received: number; // bytes
  total: number; // bytes (0 if unknown)
  filename: string;
  error: string | null;
}

const INITIAL: DownloadState = {
  status: "idle",
  progress: 0,
  received: 0,
  total: 0,
  filename: "",
  error: null,
};

export function useDownload() {
  const { url, result } = usePulliqStore();
  const [state, setState] = React.useState<DownloadState>(INITIAL);
  const abortRef = React.useRef<AbortController | null>(null);

  const download = React.useCallback(
    async (opts: { format: string; clean?: boolean }) => {
      if (!url) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({ ...INITIAL, status: "preparing" });

      trackDownloadStart(opts.format, !!opts.clean, result?.platform);

      try {
        const res = await fetch("/api/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, format: opts.format, clean: !!opts.clean }),
          signal: controller.signal,
        });

        if (!res.ok) {
          let msg = `Download failed (${res.status})`;
          try {
            const j = await res.json();
            if (j?.error) msg = j.error;
          } catch {
            /* ignore */
          }
          setState({ ...INITIAL, status: "error", error: msg });
          trackDownloadError(opts.format, msg);
          return;
        }

        // Parse filename from Content-Disposition (prefer RFC 5987 UTF-8 filename*).
        const cd = res.headers.get("content-disposition") ?? "";
        const utf8 =
          /filename\*=UTF-8''([^;]+)/i.exec(cd)?.[1] ?? "";
        const filename = decodeURIComponentSafe(utf8)
          || /filename="?([^";]+)"?/i.exec(cd)?.[1]?.trim()
          || defaultFilename(result, opts.format);

        const total = Number(res.headers.get("content-length") ?? 0);

        if (!res.body) {
          // No streaming - fallback to blob
          const blob = await res.blob();
          triggerBlobDownload(blob, filename);
          setState({
            ...INITIAL,
            status: "done",
            received: blob.size,
            total: blob.size,
            progress: 1,
            filename,
          });
          trackDownloadSuccess(opts.format, !!opts.clean, result?.platform);
          return;
        }

        setState((s) => ({ ...s, status: "downloading", filename, total }));

        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            received += value.length;
            setState((s) => ({
              ...s,
              received,
              total: total || s.total,
              progress: total ? received / total : 0,
            }));
          }
        }

        const blob = new Blob(chunks as BlobPart[], {
          type: res.headers.get("content-type") ?? "application/octet-stream",
        });
        triggerBlobDownload(blob, filename);

        setState((s) => ({
          ...s,
          status: "done",
          progress: 1,
          received,
          total: total || received,
        }));
        trackDownloadSuccess(opts.format, !!opts.clean, result?.platform);
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setState({ ...INITIAL, status: "idle" });
          return;
        }
        setState({
          ...INITIAL,
          status: "error",
          error: err instanceof Error ? err.message : "Download failed",
        });
        trackDownloadError(
          opts.format,
          err instanceof Error ? err.message : "Download failed"
        );
      }
    },
    [url, result]
  );

  const cancel = React.useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL);
  }, []);

  const reset = React.useCallback(() => setState(INITIAL), []);

  return { state, download, cancel, reset };
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
}

function defaultFilename(result: AnalyzeResponse | null, format: string): string {
  const base = (result?.title ?? "pulliq-media")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "pulliq-media";
  const ext = format === "mp3-128" ? "mp3" : "mp4";
  return `${base}.${ext}`;
}

function decodeURIComponentSafe(s: string): string {
  if (!s) return "";
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
