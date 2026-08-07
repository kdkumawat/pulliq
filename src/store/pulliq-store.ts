"use client";

import { create } from "zustand";
import type { AnalyzeResponse, ViewName } from "@/lib/media/types";

interface PulliqState {
  view: ViewName;
  url: string;
  result: AnalyzeResponse | null;
  analyzing: boolean;
  error: string | null;
  setView: (v: ViewName) => void;
  setUrl: (u: string) => void;
  setResult: (r: AnalyzeResponse | null) => void;
  setAnalyzing: (a: boolean) => void;
  setError: (e: string | null) => void;
  reset: () => void;
  startAnalyze: (url: string) => void;
}

export const usePulliqStore = create<PulliqState>((set) => ({
  view: "landing",
  url: "",
  result: null,
  analyzing: false,
  error: null,
  setView: (v) => set({ view: v }),
  setUrl: (u) => set({ url: u }),
  setResult: (r) => set({ result: r }),
  setAnalyzing: (a) => set({ analyzing: a }),
  setError: (e) => set({ error: e }),
  reset: () => set({ view: "landing", result: null, error: null, analyzing: false }),
  startAnalyze: (url) =>
    set({ url, view: "analyze", analyzing: true, error: null, result: null }),
}));
