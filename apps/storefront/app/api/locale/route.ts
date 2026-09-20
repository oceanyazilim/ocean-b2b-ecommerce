import { NextResponse, type NextRequest } from "next/server";

import { LOCALE_BANNER_DISMISSED_COOKIE, LOCALE_COOKIE } from "@/lib/locale";

const MAX_AGE = 60 * 60 * 24 * 365; // 1 year

// Storefront-only concern (no API round trip needed — locale is never persisted server-side,
// just remembered in the buyer's own browser), so this stays a local route handler rather than
// going through the [...path] proxy: Server Components can't set cookies themselves outside a
// Server Action / Route Handler, see lib/api.ts's comment on the same constraint for cart/auth.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { action?: string; locale?: string } | null;
  const res = NextResponse.json({ ok: true });

  if (body?.action === "dismiss" && body.locale) {
    // Remembers *which* suggestion was dismissed (not "never suggest again") — if the buyer's
    // browser language changes later, a new, different suggestion can still show.
    res.cookies.set(LOCALE_BANNER_DISMISSED_COOKIE, body.locale, { path: "/", maxAge: MAX_AGE, sameSite: "lax" });
    return res;
  }

  if (body?.locale) {
    res.cookies.set(LOCALE_COOKIE, body.locale, { path: "/", maxAge: MAX_AGE, sameSite: "lax" });
    // An explicit language pick always clears any pending "you might prefer X" suggestion state
    // for that same locale, so the banner doesn't immediately re-offer what was just chosen.
    res.cookies.delete(LOCALE_BANNER_DISMISSED_COOKIE);
    return res;
  }

  return NextResponse.json({ ok: false }, { status: 400 });
}
