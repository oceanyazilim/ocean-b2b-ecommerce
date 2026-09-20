import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { StorefrontShell } from "../storefront-shell";
import { ConsentManager } from "./consent-manager";

export const metadata = { title: "Consent · Ocean Admin" };

export default async function StorefrontConsentPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/storefront/consent");
  return (
    <StorefrontShell storeSlug={store.slug}>
      {can(store, "settings.read") ? (
        <ConsentManager storeId={store.id} canWrite={can(store, "settings.write")} />
      ) : (
        <Alert variant="warning">Your role cannot view consent settings.</Alert>
      )}
    </StorefrontShell>
  );
}
