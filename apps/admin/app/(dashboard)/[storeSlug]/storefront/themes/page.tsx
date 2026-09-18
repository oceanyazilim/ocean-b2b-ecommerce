import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { StorefrontShell } from "../storefront-shell";
import { ThemesManager } from "./themes-manager";

export const metadata = { title: "Themes · Ocean Admin" };

export default async function StorefrontThemesPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/storefront/themes");
  return (
    <StorefrontShell storeSlug={store.slug}>
      {can(store, "themes.read") ? (
        <ThemesManager storeId={store.id} storeSlug={store.slug} canEdit={can(store, "themes.edit")} />
      ) : (
        <Alert variant="warning">Your role cannot view themes.</Alert>
      )}
    </StorefrontShell>
  );
}
