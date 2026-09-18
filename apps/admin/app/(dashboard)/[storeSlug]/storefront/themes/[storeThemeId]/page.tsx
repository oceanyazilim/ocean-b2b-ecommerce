import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { ThemeDetail } from "./theme-detail";

export const metadata = { title: "Theme · Ocean Admin" };

export default async function ThemeDetailPage({
  params,
}: {
  params: Promise<{ storeSlug: string; storeThemeId: string }>;
}) {
  const { storeSlug, storeThemeId } = await params;
  const { store } = await loadStorePage(storeSlug, `/storefront/themes/${storeThemeId}`);
  if (!can(store, "themes.read")) {
    return <Alert variant="warning">Your role cannot view themes.</Alert>;
  }
  return (
    <ThemeDetail
      storeId={store.id}
      storeSlug={store.slug}
      storeThemeId={storeThemeId}
      canEdit={can(store, "themes.edit")}
      canPublish={can(store, "themes.publish")}
    />
  );
}
