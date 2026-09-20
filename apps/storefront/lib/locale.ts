import "server-only";

import type { StorefrontLanguageSummary } from "@ocean/types";
import { cookies, headers } from "next/headers";
import { cache } from "react";

import { storefrontFetch } from "./api";

// L4 Global Localization: the buyer's active storefront locale is a plain cookie (no auth
// concept involved — a guest browsing before signing in still needs a language), and the
// "we suggested this language, you said no" state is a second cookie so the detection banner
// (see components/language-banner.tsx) never nags about the same suggestion twice.
export const LOCALE_COOKIE = "ocean_locale";
export const LOCALE_BANNER_DISMISSED_COOKIE = "ocean_locale_suggested_dismissed";

// `cache()` de-dupes this within a single request/render — the root layout, the language
// switcher and the banner all need it, and it's otherwise a network round trip each.
export const getLanguages = cache(async (): Promise<StorefrontLanguageSummary[]> => {
  try {
    const res = await storefrontFetch<{ data: StorefrontLanguageSummary[] }>("/languages");
    return res.data;
  } catch {
    return [];
  }
});

export interface ActiveLocale {
  locale: string;
  isRtl: boolean;
  isDefault: boolean;
  languages: StorefrontLanguageSummary[];
}

// Resolves what the buyer is actually browsing in right now: the cookie's locale if it's still a
// published language for this store, otherwise the store's own default language, otherwise a
// hardcoded last-resort ("en-US", ltr) for a store that hasn't opted into multi-language at all.
export const getActiveLocale = cache(async (): Promise<ActiveLocale> => {
  const languages = await getLanguages();
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const def = languages.find((l) => l.isDefault) ?? null;
  const active = (cookieLocale && languages.find((l) => l.locale === cookieLocale)) || def;
  if (!active) return { locale: "en-US", isRtl: false, isDefault: true, languages };
  return { locale: active.locale, isRtl: active.isRtl, isDefault: active.isDefault, languages };
});

function parseAcceptLanguage(header: string): string[] {
  return header
    .split(",")
    .map((part) => {
      const [tag, qPart] = part.trim().split(";q=");
      const q = qPart ? Number.parseFloat(qPart) : 1;
      return { tag: (tag ?? "").trim(), q: Number.isFinite(q) ? q : 1 };
    })
    .filter((e) => e.tag)
    .sort((a, b) => b.q - a.q)
    .map((e) => e.tag);
}

// Automatic customer language detection (spec section 9): compares the browser's Accept-Language
// header against this store's published languages and suggests the best match, when it differs
// from what the buyer is currently browsing in and they haven't already dismissed that exact
// suggestion.
export const getSuggestedLocale = cache(async (): Promise<StorefrontLanguageSummary | null> => {
  const { locale: activeLocale, languages } = await getActiveLocale();
  if (languages.length < 2) return null;

  const acceptLanguage = (await headers()).get("accept-language");
  if (!acceptLanguage) return null;
  const preferred = parseAcceptLanguage(acceptLanguage);

  let best: StorefrontLanguageSummary | null = null;
  outer: for (const tag of preferred) {
    const primary = tag.split("-")[0]?.toLowerCase();
    // Prefer an exact locale match first, then fall back to a same-primary-subtag match
    // (e.g. browser "de" or "de-AT" both match a store's "de-DE").
    for (const lang of languages) {
      if (lang.locale.toLowerCase() === tag.toLowerCase()) {
        best = lang;
        break outer;
      }
    }
    for (const lang of languages) {
      if (lang.locale.split("-")[0]?.toLowerCase() === primary) {
        best = lang;
        break outer;
      }
    }
  }
  if (!best || best.locale === activeLocale) return null;

  const cookieStore = await cookies();
  const dismissed = cookieStore.get(LOCALE_BANNER_DISMISSED_COOKIE)?.value;
  if (dismissed === best.locale) return null;

  return best;
});
