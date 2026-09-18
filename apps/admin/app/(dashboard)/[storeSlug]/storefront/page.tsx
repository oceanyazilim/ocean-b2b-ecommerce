import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { MarketsManager } from "./markets-manager";
import { StorefrontShell } from "./storefront-shell";

export const metadata = { title: "Markets · Ocean Admin" };

export default async function StorefrontMarketsPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/storefront");
  return (
    <StorefrontShell storeSlug={store.slug}>
      {can(store, "settings.read") ? (
        <MarketsManager storeId={store.id} canWrite={can(store, "settings.write")} />
      ) : (
        <Alert variant="warning">Your role cannot view markets.</Alert>
      )}
    </StorefrontShell>
  );
}
