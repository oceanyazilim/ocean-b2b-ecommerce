import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { ThemeEditor } from "./theme-editor";

export const metadata = { title: "Theme editor · Ocean Admin" };

export default async function ThemeEditorPage({
  params,
}: {
  params: Promise<{ storeSlug: string; storeThemeId: string }>;
}) {
  const { storeSlug, storeThemeId } = await params;
  const { store } = await loadStorePage(storeSlug, `/storefront/themes/${storeThemeId}/editor`);
  if (!can(store, "themes.edit")) {
    return <Alert variant="warning">Your role cannot edit themes.</Alert>;
  }
  return (
    <ThemeEditor
      storeId={store.id}
      storeSlug={store.slug}
      storeThemeId={storeThemeId}
      canPublish={can(store, "themes.publish")}
    />
  );
}
