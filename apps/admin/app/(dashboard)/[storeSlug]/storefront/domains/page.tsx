import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { StorefrontShell } from "../storefront-shell";
import { DomainsManager } from "./domains-manager";

export const metadata = { title: "Domains · Ocean Admin" };

export default async function StorefrontDomainsPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/storefront/domains");
  return (
    <StorefrontShell storeSlug={store.slug}>
      {can(store, "settings.read") ? (
        <DomainsManager storeId={store.id} canWrite={can(store, "settings.write")} />
      ) : (
        <Alert variant="warning">Your role cannot view domains.</Alert>
      )}
    </StorefrontShell>
  );
}
