"use client";

import { LanguagesIcon, Select } from "@ocean/ui";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ADMIN_LOCALE_COOKIE, type AdminLocale, isAdminLocale } from "@/lib/locale";

// Admin-panel language switcher (Türkçe / English — spec section 1). This changes ONLY the
// admin dashboard chrome's language, via a small first-party cookie the request-level i18n
// config (i18n/request.ts) reads on the next render. It never reads or writes anything
// storefront-related — the storefront's own languages are a completely separate, later-phase
// concept, and there is no shared "locale" state between the two here.
//
// Persistence is per-browser (cookie), not per-user-account — see the i18n phase report for why
// (avoiding a schema.prisma migration while a sibling agent may be changing it concurrently).
function setAdminLocaleCookie(locale: AdminLocale) {
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `${ADMIN_LOCALE_COOKIE}=${locale}; path=/; max-age=${oneYear}; samesite=lax`;
}

export function LanguageSwitcher({ variant = "compact" }: { variant?: "compact" | "full" }) {
  const locale = useLocale();
  const t = useTranslations("common");
  const router = useRouter();
  const [pending, setPending] = useState(false);

  function onChange(next: string) {
    if (!isAdminLocale(next) || next === locale) return;
    setPending(true);
    setAdminLocaleCookie(next);
    router.refresh();
    // router.refresh() re-runs server components with the new cookie; clear the pending state
    // on the next tick rather than waiting on a promise router.refresh() doesn't return.
    setTimeout(() => setPending(false), 300);
  }

  if (variant === "full") {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <LanguagesIcon size={16} />
          {t("language")}
        </div>
        <div className="flex gap-2">
          {(["en", "tr"] as const).map((code) => (
            <button
              key={code}
              type="button"
              disabled={pending}
              onClick={() => onChange(code)}
              aria-pressed={locale === code}
              className={
                "flex-1 rounded-md border px-4 py-2.5 text-left text-sm transition-colors disabled:opacity-60 " +
                (locale === code
                  ? "border-primary bg-accent font-medium text-foreground"
                  : "border-input hover:bg-accent/60")
              }
            >
              {code === "en" ? t("english") : t("turkish")}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <Select
      aria-label={t("language")}
      value={locale}
      disabled={pending}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-auto"
    >
      <option value="en">{t("english")}</option>
      <option value="tr">{t("turkish")}</option>
    </Select>
  );
}
