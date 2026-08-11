import { NextResponse } from "next/server";
import { getAnalyticsStatus } from "@/lib/analytics-config";
import { processQueueStats } from "@/lib/media/concurrency";
import { getServerStats, incrementKeepAlivePings } from "@/lib/server-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ua = req.headers.get("user-agent") ?? "";
  if (ua.includes("pulliq-keep-alive")) {
    incrementKeepAlivePings();
  }

  const analytics = getAnalyticsStatus();

  return NextResponse.json({
    ok: true,
    service: "pulliq",
    uptimeSec: Math.floor(process.uptime()),
    analytics: {
      enabled: analytics.enabled,
      source: analytics.source,
      measurementIdHint: analytics.measurementIdHint,
    },
    stats: getServerStats(),
    processes: processQueueStats(),
  });
}
