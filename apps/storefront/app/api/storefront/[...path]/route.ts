import { NextResponse, type NextRequest } from "next/server";

// Same-origin proxy for everything client components need to call (cart, auth, checkout).
// Two things only a real HTTP round-trip to the Next.js server itself can give us: the
// request's own hostname (which StorefrontGuard trusts to resolve the tenant via
// X-Forwarded-Host — a direct browser->API fetch would carry the API's own host instead, and
// Node's fetch silently ignores an explicit `Host` header override, see storefront.guard.ts),
// and a place to relay Set-Cookie back to the browser — Server Components can't set cookies
// outside a Server Action or Route Handler, so read-only pages fetch the API directly (see
// lib/api.ts) while anything that can set a cookie comes through here instead.
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");

async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const target = `${API_URL}/storefront/v1/${path.join("/")}${req.nextUrl.search}`;
  const host = req.headers.get("host") ?? "";
  const cookie = req.headers.get("cookie") ?? "";
  const hasBody = req.method !== "GET" && req.method !== "HEAD" && req.method !== "DELETE";
  const body = hasBody ? await req.text() : null;

  const upstream = await fetch(target, {
    method: req.method,
    headers: {
      accept: "application/json",
      "x-forwarded-host": host,
      cookie,
      ...(body !== null ? { "content-type": "application/json" } : {}),
      ...(req.headers.get("idempotency-key")
        ? { "idempotency-key": req.headers.get("idempotency-key") as string }
        : {}),
    },
    body,
    cache: "no-store",
  });

  const text = await upstream.text();
  const res = new NextResponse(text, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
  for (const cookieStr of upstream.headers.getSetCookie()) {
    res.headers.append("set-cookie", cookieStr);
  }
  return res;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
