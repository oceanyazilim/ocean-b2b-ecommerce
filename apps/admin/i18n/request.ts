import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { ADMIN_LOCALE_COOKIE, DEFAULT_ADMIN_LOCALE, isAdminLocale } from "@/lib/locale";

// The admin panel only ever supports two languages (Türkçe / English) and doesn't use
// locale-prefixed routing (no /en/... or /tr/... URLs) — the store is already keyed by
// [storeSlug], and admin auth is a plain session, not a locale. Instead the locale is resolved
// per-request from a small first-party cookie set by the language switcher
// (components/language-switcher.tsx). This is next-intl's supported "without i18n routing"
// setup: https://next-intl.dev/docs/getting-started/app-router/without-i18n-routing
//
// Only two namespaces are wired up (common, shell, dashboard) — see the i18n phase report for
// exactly what is and isn't translated yet.
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(ADMIN_LOCALE_COOKIE)?.value;
  const locale = isAdminLocale(cookieLocale) ? cookieLocale : DEFAULT_ADMIN_LOCALE;

  const [common, shell, dashboard, account] = await Promise.all([
    import(`../locales/${locale}/common.json`),
    import(`../locales/${locale}/shell.json`),
    import(`../locales/${locale}/dashboard.json`),
    import(`../locales/${locale}/account.json`),
  ]);

  return {
    locale,
    messages: {
      common: common.default,
      shell: shell.default,
      dashboard: dashboard.default,
      account: account.default,
    },
  };
});
