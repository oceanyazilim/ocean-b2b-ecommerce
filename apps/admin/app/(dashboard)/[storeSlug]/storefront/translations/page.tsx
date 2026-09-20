import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { StorefrontShell } from "../storefront-shell";
import { TranslationsManager } from "./translations-manager";

export const metadata = { title: "Translations · Ocean Admin" };

export default async function StorefrontTranslationsPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/storefront/translations");
  return (
    <StorefrontShell storeSlug={store.slug}>
      {can(store, "content.read") ? (
        <TranslationsManager storeId={store.id} canWrite={can(store, "content.write")} />
      ) : (
        <Alert variant="warning">Your role cannot view translations.</Alert>
      )}
    </StorefrontShell>
  );
}
