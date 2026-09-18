import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { StorefrontShell } from "../storefront-shell";
import { MenusManager } from "./menus-manager";

export const metadata = { title: "Menus · Ocean Admin" };

export default async function StorefrontMenusPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/storefront/menus");
  return (
    <StorefrontShell storeSlug={store.slug}>
      {can(store, "content.read") ? (
        <MenusManager storeId={store.id} canWrite={can(store, "content.write")} />
      ) : (
        <Alert variant="warning">Your role cannot view menus.</Alert>
      )}
    </StorefrontShell>
  );
}
