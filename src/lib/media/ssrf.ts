import { lookup } from "node:dns/promises";
import { normalizeUrl } from "./platform";

/**
 * SSRF guard. Asserts that the URL is http(s) and does not resolve to a
 * private/loopback/link-local/CGNAT address.
 *
 * Throws a clear Error on violation. Returns the parsed URL on success.
 */

const PRIVATE_IPV4_RE =
  /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;

// IPv6: loopback (::1), unique-local (fc00::/7 → fc/fd prefix),
// link-local (fe80::/10), unspecified (::), and IPv4-mapped (::ffff:).
const PRIVATE_IPV6_RE = /^(::1|fc[0-9a-f]{2}:|fd[0-9a-f]{2}:|fe80:|::|::ffff:)/i;

export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(normalizeUrl(rawUrl));
  } catch {
    throw new Error("Invalid URL");
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`Disallowed protocol: ${u.protocol}`);
  }

  const host = u.hostname;
  if (!host) throw new Error("URL has no hostname");

  // Block obvious internal-looking hosts without doing DNS.
  if (/^(localhost|internal|intranet|metadata)/i.test(host)) {
    throw new Error(`Blocked hostname: ${host}`);
  }

  // AWS / cloud metadata endpoints
  if (host === "169.254.169.254" || host === "metadata.google.internal") {
    throw new Error("Blocked metadata endpoint");
  }

  let addrs: { address: string; family: number }[] = [];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new Error(`DNS lookup failed for ${host}`);
  }

  if (!addrs.length) {
    throw new Error(`No DNS records for ${host}`);
  }

  for (const a of addrs) {
    if (PRIVATE_IPV4_RE.test(a.address) || PRIVATE_IPV6_RE.test(a.address)) {
      throw new Error(
        `Resolved private/internal address: ${a.address} (host ${host})`
      );
    }
  }

  return u;
}
