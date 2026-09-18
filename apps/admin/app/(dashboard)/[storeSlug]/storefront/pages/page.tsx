import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { StorefrontShell } from "../storefront-shell";
import { PagesManager } from "./pages-manager";

export const metadata = { title: "Pages · Ocean Admin" };

export default async function StorefrontPagesPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/storefront/pages");
  return (
    <StorefrontShell storeSlug={store.slug}>
      {can(store, "content.read") ? (
        <PagesManager storeId={store.id} canWrite={can(store, "content.write")} />
      ) : (
        <Alert variant="warning">Your role cannot view pages.</Alert>
      )}
    </StorefrontShell>
  );
}
