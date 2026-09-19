import { lookup } from "node:dns/promises";
import { isIPv4 } from "node:net";

import { ValidationError } from "../errors/domain-error";

// Best-effort SSRF guard for user-supplied outbound URLs (webhook targets, and anything else
// this server will later fetch() on a schedule rather than in direct response to the caller's
// own request). Resolves the hostname and rejects loopback/private/link-local/multicast
// destinations — including the common cloud-metadata address 169.254.169.254. Not a complete
// defense against DNS rebinding (a hostname could repoint between the create-time check here
// and a later delivery attempt) — callers that fetch repeatedly (WebhookDispatchService) should
// re-run this check at delivery time too, not just once at creation.
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 127) return true; // loopback
  if (a === 10) return true; // private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 0) return true; // "this network"
  if (a >= 224) return true; // multicast/reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  return (
    lower === "::1" || // loopback
    lower === "::" ||
    lower.startsWith("fe80:") || // link-local
    lower.startsWith("fc") || // unique local
    lower.startsWith("fd") || // unique local
    lower.startsWith("::ffff:127.") || // IPv4-mapped loopback
    lower.startsWith("::ffff:10.") ||
    lower.startsWith("::ffff:169.254.")
  );
}

export async function assertPublicHttpUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ValidationError("Not a valid URL.", [{ path: "url", message: "Not a valid URL" }]);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ValidationError("Only http/https URLs are allowed.", [
      { path: "url", message: "Only http/https URLs are allowed" },
    ]);
  }

  // Only enforced outside production: local development and this test suite both routinely
  // point webhooks at 127.0.0.1 (a real receiver spun up in-process), which is exactly what
  // this guard exists to block for a real, untrusted merchant-supplied URL in production.
  if (process.env.NODE_ENV !== "production") return;

  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new ValidationError("This URL points at a local/internal address.", [
      { path: "url", message: "This URL points at a local/internal address" },
    ]);
  }

  let addresses: { address: string; family: number }[];
  try {
    const result = await lookup(hostname, { all: true });
    addresses = Array.isArray(result) ? result : [result];
  } catch {
    // Unresolvable hostname — let the actual delivery attempt fail later with a clear
    // "failed"/"pending retry" status rather than blocking creation on a DNS hiccup.
    return;
  }

  for (const { address } of addresses) {
    const blocked = isIPv4(address) ? isPrivateIPv4(address) : isPrivateIPv6(address);
    if (blocked) {
      throw new ValidationError("This URL points at a local/internal address.", [
        { path: "url", message: "This URL points at a local/internal address" },
      ]);
    }
  }
}
