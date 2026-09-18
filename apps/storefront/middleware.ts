import { NextResponse, type NextRequest } from "next/server";

// Turns a `?preview_token=` query param into a request header the rest of the app can read via
// headers() — including the root layout, which (unlike page.tsx) never receives searchParams as
// a prop. A cookie would be the more usual way to carry this across a session, but the theme
// editor's live-preview iframe is cross-site (admin's origin embeds the storefront's), and a
// SameSite=Lax cookie set by that iframe is silently dropped on the iframe's own next request —
// it isn't the top-level navigation SameSite treats as same-site. A header set by middleware on
// the request itself has no such restriction.
export function middleware(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("preview_token");
  if (!token) return NextResponse.next();
  const headers = new Headers(req.headers);
  headers.set("x-theme-preview-token", token);
  return NextResponse.next({ request: { headers } });
}
