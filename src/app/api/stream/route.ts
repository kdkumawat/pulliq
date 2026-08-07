import { NextResponse } from "next/server";
import { assertSafeUrl } from "@/lib/media/ssrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/stream?u=<encoded direct media url>
 *
 * Proxies a remote media URL back to the browser so that <video>/<audio>
 * elements can play it without CORS issues, with Range (seek) support.
 * The URL is SSRF-validated before fetching.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("u");
  if (!raw) {
    return NextResponse.json(
      { ok: false, error: "Missing 'u' parameter." },
      { status: 400 }
    );
  }

  // SSRF guard - throws on private/loopback/link-local hosts.
  let parsed: URL;
  try {
    parsed = await assertSafeUrl(raw);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Forbidden source URL." },
      { status: 403 }
    );
  }

  // Forward Range header for seeking + a realistic UA (some CDNs require one).
  const upstreamHeaders: Record<string, string> = {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    accept: "*/*",
  };
  const range = req.headers.get("range");
  if (range) upstreamHeaders["range"] = range;
  const referer = req.headers.get("referer");
  if (referer) upstreamHeaders["referer"] = referer;

  let upstream: Response;
  try {
    upstream = await fetch(parsed.href, {
      headers: upstreamHeaders,
      redirect: "follow",
      // @ts-expect-error - Next.js fetch supports this duplex option for streaming.
      duplex: "half",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[stream] upstream fetch failed:", msg);
    return NextResponse.json(
      { ok: false, error: "Could not reach the media source." },
      { status: 502 }
    );
  }

  // Build response headers, forwarding the ones <video> needs.
  const respHeaders = new Headers();
  const forward = [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "last-modified",
    "etag",
  ];
  for (const h of forward) {
    const v = upstream.headers.get(h);
    if (v) respHeaders.set(h, v);
  }
  // Always advertise range support so the browser attempts seeking.
  if (!respHeaders.has("accept-ranges")) {
    respHeaders.set("accept-ranges", "bytes");
  }
  // Allow the browser to cache the stream chunk for the session.
  respHeaders.set("cache-control", "public, max-age=3600");

  if (!upstream.body) {
    return NextResponse.json(
      { ok: false, error: "Empty media response." },
      { status: 502 }
    );
  }

  // Stream the upstream body straight through. Web ReadableStream is fine here.
  return new Response(upstream.body as unknown as BodyInit, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
}
