import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { StorefrontShell } from "../storefront-shell";
import { LegalManager } from "./legal-manager";

export const metadata = { title: "Legal · Ocean Admin" };

export default async function StorefrontLegalPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/storefront/legal");
  return (
    <StorefrontShell storeSlug={store.slug}>
      {can(store, "content.read") ? (
        <LegalManager storeId={store.id} canWrite={can(store, "content.write")} />
      ) : (
        <Alert variant="warning">Your role cannot view legal content.</Alert>
      )}
    </StorefrontShell>
  );
}
