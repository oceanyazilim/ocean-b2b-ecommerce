import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ocean/ui";
import { getTranslations } from "next-intl/server";

import { LanguageSwitcher } from "@/components/language-switcher";
import { requireMe } from "@/lib/session";

export const metadata = { title: "Language · Ocean Admin" };

// Admin-panel language preference (Türkçe / English — spec section 1 / 39 / 40). Deliberately
// lives under the per-user Account area (alongside Account security) rather than per-store
// Settings, since it's a preference for this person's own admin session, not a store-wide
// setting — and it must never be confused with the storefront's own (separate, later-phase)
// language configuration.
export default async function LanguagePage() {
  await requireMe("/account/language");
  const t = await getTranslations("account.language");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <LanguageSwitcher variant="full" />
      </CardContent>
    </Card>
  );
}
