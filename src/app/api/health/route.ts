import { NextResponse } from "next/server";
import { getServerStats, incrementKeepAlivePings } from "@/lib/server-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ua = req.headers.get("user-agent") ?? "";
  if (ua.includes("pulliq-keep-alive")) {
    incrementKeepAlivePings();
  }

  return NextResponse.json({
    ok: true,
    service: "pulliq",
    uptimeSec: Math.floor(process.uptime()),
    stats: getServerStats(),
  });
}
