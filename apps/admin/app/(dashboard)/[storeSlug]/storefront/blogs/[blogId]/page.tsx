import { Alert } from "@ocean/ui";
import Link from "next/link";

import { api } from "@/lib/api";
import { can, cookieHeader } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { ArticlesManager } from "./articles-manager";

export const metadata = { title: "Blog · Ocean Admin" };

export default async function BlogArticlesPage({
  params,
}: {
  params: Promise<{ storeSlug: string; blogId: string }>;
}) {
  const { storeSlug, blogId } = await params;
  const { store } = await loadStorePage(storeSlug, "/storefront/blogs");

  if (!can(store, "content.read")) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="warning">Your role cannot view blogs.</Alert>
      </div>
    );
  }

  const { data: blog } = await api<{ data: { title: string; handle: string } }>(
    `/stores/${store.id}/blogs/${blogId}`,
    { cookie: await cookieHeader() },
  ).catch(() => ({ data: null as unknown as { title: string; handle: string } }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link
          href={`/${store.slug}/storefront/blogs`}
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          ← All blogs
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{blog?.title ?? "Blog"}</h1>
        {blog && <p className="text-sm text-muted-foreground">/blogs/{blog.handle}</p>}
      </div>
      <ArticlesManager storeId={store.id} blogId={blogId} canWrite={can(store, "content.write")} />
    </div>
  );
}
