"use client";

import { Button } from "@ocean/ui";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/lib/api";

// Shared chrome atom used both inside the in-scope dashboard shell header and on a couple of
// out-of-scope pages (Account, Onboarding) that reuse the same header pattern. Translating it
// means "Sign out" flips to "Çıkış yap" everywhere it appears, even on pages whose own content
// stays English for this pass — see the i18n phase report.
export function LogoutButton() {
  const t = useTranslations("common");
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={logout} loading={pending}>
      {t("signOut")}
    </Button>
  );
}
