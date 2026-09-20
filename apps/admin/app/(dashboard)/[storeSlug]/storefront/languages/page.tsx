import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { StorefrontShell } from "../storefront-shell";
import { LanguagesManager } from "./languages-manager";

export const metadata = { title: "Languages · Ocean Admin" };

export default async function StorefrontLanguagesPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/storefront/languages");
  return (
    <StorefrontShell storeSlug={store.slug}>
      {can(store, "settings.read") ? (
        <LanguagesManager storeId={store.id} canWrite={can(store, "settings.write")} />
      ) : (
        <Alert variant="warning">Your role cannot view languages.</Alert>
      )}
    </StorefrontShell>
  );
}
