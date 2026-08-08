/** Google Analytics 4 event helpers (client-only). */

type EventParams = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    gtag?: (
      command: "config" | "event" | "js",
      targetId: string | Date,
      params?: Record<string, unknown>
    ) => void;
  }
}

export const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "";

export function isAnalyticsEnabled(): boolean {
  return !!GA_MEASUREMENT_ID;
}

function gtagEvent(name: string, params?: EventParams) {
  if (typeof window === "undefined" || !window.gtag || !GA_MEASUREMENT_ID) {
    return;
  }
  const clean: Record<string, string | number | boolean> = {};
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) clean[k] = v;
    }
  }
  window.gtag("event", name, clean);
}

/** SPA screen (landing vs analyze). */
export function trackScreen(screen: "landing" | "analyze") {
  gtagEvent("screen_view", { screen_name: screen, app_name: "pulliq" });
}

export function trackAnalyzeStart(platformHint?: string) {
  gtagEvent("analyze_start", { platform_hint: platformHint ?? "unknown" });
}

export function trackAnalyzeSuccess(platform: string, kind: string) {
  gtagEvent("analyze_success", { platform, media_kind: kind });
}

export function trackAnalyzeError(message: string) {
  gtagEvent("analyze_error", {
    error_message: message.slice(0, 100),
  });
}

export function trackDownloadStart(format: string, clean: boolean, platform?: string) {
  gtagEvent("download_start", {
    format,
    clean_copy: clean,
    platform: platform ?? "unknown",
  });
}

export function trackDownloadSuccess(format: string, clean: boolean, platform?: string) {
  gtagEvent("download_success", {
    format,
    clean_copy: clean,
    platform: platform ?? "unknown",
  });
}

export function trackDownloadError(format: string, message: string) {
  gtagEvent("download_error", {
    format,
    error_message: message.slice(0, 100),
  });
}
