// Admin-panel language (Türkçe / English) constants shared by server and client code.
//
// This is deliberately independent from any storefront/merchant-facing locale concept — the
// admin dashboard chrome the merchant's team sees and the languages a storefront sells in are
// two unrelated settings. Nothing here reads or writes a storefront locale, and nothing in the
// storefront reads this cookie.
export const ADMIN_LOCALES = ["en", "tr"] as const;
export type AdminLocale = (typeof ADMIN_LOCALES)[number];
export const DEFAULT_ADMIN_LOCALE: AdminLocale = "en";

// Plain (non-httpOnly) cookie: the language switcher (a client component) needs to write it
// directly via `document.cookie`, and it holds no sensitive data. Stored client-side (cookie)
// rather than as a User column — see the L1 i18n phase report for why: it keeps this pass
// isolated from the sibling agent's concurrent schema.prisma work.
export const ADMIN_LOCALE_COOKIE = "ocean_admin_locale";

export function isAdminLocale(value: string | undefined | null): value is AdminLocale {
  return !!value && (ADMIN_LOCALES as readonly string[]).includes(value);
}
