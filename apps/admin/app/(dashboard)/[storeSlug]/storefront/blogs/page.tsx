import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { StorefrontShell } from "../storefront-shell";
import { BlogsManager } from "./blogs-manager";

export const metadata = { title: "Blogs · Ocean Admin" };

export default async function StorefrontBlogsPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/storefront/blogs");
  return (
    <StorefrontShell storeSlug={store.slug}>
      {can(store, "content.read") ? (
        <BlogsManager storeId={store.id} storeSlug={store.slug} canWrite={can(store, "content.write")} />
      ) : (
        <Alert variant="warning">Your role cannot view blogs.</Alert>
      )}
    </StorefrontShell>
  );
}
