import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { MediaLibrary } from "./media-library";

export const metadata = { title: "Files · Ocean Admin" };

export default async function FilesPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/settings/files");
  if (!can(store, "products.read"))
    return <Alert variant="warning">Your role cannot view files.</Alert>;
  return <MediaLibrary storeId={store.id} canWrite={can(store, "content.write")} />;
}
