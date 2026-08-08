export type AnalyticsConfigSource = "GA_MEASUREMENT_ID" | "NEXT_PUBLIC_GA_MEASUREMENT_ID" | null;

export interface AnalyticsStatus {
  enabled: boolean;
  source: AnalyticsConfigSource;
  /** Last 4 chars only, e.g. "…43BG" */
  measurementIdHint: string | null;
}

/** Server-side GA4 measurement ID (runtime env on Docker/Render). */
export function getMeasurementId(): string {
  const fromRuntime = process.env.GA_MEASUREMENT_ID?.trim();
  if (fromRuntime) return fromRuntime;

  const fromPublic = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  if (fromPublic) return fromPublic;

  return "";
}

function maskMeasurementId(id: string): string {
  if (id.length <= 4) return "…";
  return `…${id.slice(-4)}`;
}

export function getAnalyticsStatus(): AnalyticsStatus {
  const fromRuntime = process.env.GA_MEASUREMENT_ID?.trim();
  if (fromRuntime) {
    return {
      enabled: true,
      source: "GA_MEASUREMENT_ID",
      measurementIdHint: maskMeasurementId(fromRuntime),
    };
  }

  const fromPublic = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  if (fromPublic) {
    return {
      enabled: true,
      source: "NEXT_PUBLIC_GA_MEASUREMENT_ID",
      measurementIdHint: maskMeasurementId(fromPublic),
    };
  }

  return {
    enabled: false,
    source: null,
    measurementIdHint: null,
  };
}

export function logAnalyticsStatus(): void {
  const status = getAnalyticsStatus();
  if (status.enabled) {
    console.info(
      `[analytics] enabled via ${status.source} (id ${status.measurementIdHint})`
    );
  } else {
    console.warn(
      "[analytics] disabled: set GA_MEASUREMENT_ID or NEXT_PUBLIC_GA_MEASUREMENT_ID"
    );
  }
}
