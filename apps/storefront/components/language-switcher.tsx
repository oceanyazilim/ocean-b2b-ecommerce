"use client";

import type { StorefrontLanguageSummary } from "@ocean/types";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Settings -> Languages / storefront language switcher (spec sections 2 & 4): every published
// StoreLanguage is selectable here, never a hardcoded list. Hidden entirely when the store only
// has one published language — nothing to switch between.
export function LanguageSwitcher({
  languages,
  activeLocale,
}: {
  languages: StorefrontLanguageSummary[];
  activeLocale: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  if (languages.length < 2) return null;

  async function onChange(locale: string) {
    if (locale === activeLocale) return;
    setPending(true);
    try {
      await fetch("/api/locale", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <select
      aria-label="Language"
      value={activeLocale}
      disabled={pending}
      onChange={(e) => void onChange(e.target.value)}
      className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground disabled:opacity-50"
    >
      {languages.map((l) => (
        <option key={l.locale} value={l.locale}>
          {l.locale}
        </option>
      ))}
    </select>
  );
}
