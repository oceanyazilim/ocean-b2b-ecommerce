import { notFound } from "next/navigation";
import Link from "next/link";

import { RenderTemplate } from "@/components/renderer/render-template";
import { getBlogArticles, getTheme } from "@/lib/storefront";

export default async function BlogPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { handle } = await params;
  const { cursor } = await searchParams;
  const [result, theme] = await Promise.all([
    getBlogArticles(handle, cursor ? { cursor } : {}),
    getTheme(),
  ]);
  if (!result) notFound();
  const { blog, articles, pageInfo } = result;

  return (
    <div className="flex flex-col gap-12">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-8 text-2xl font-semibold tracking-tight">{blog.title}</h1>
        {articles.length === 0 ? (
          <p className="text-sm text-muted-foreground">No articles published yet.</p>
        ) : (
          <div className="flex flex-col divide-y">
            {articles.map((a) => (
              <article key={a.id} className="flex flex-col gap-3 py-6 first:pt-0 sm:flex-row sm:gap-6">
                {a.featuredImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.featuredImage.url}
                    alt={a.featuredImage.alt ?? a.title}
                    className="aspect-video w-full rounded-md object-cover sm:w-48 sm:shrink-0"
                  />
                )}
                <div className="flex flex-col gap-2">
                  <Link href={`/blogs/${blog.handle}/${a.handle}`} className="text-lg font-medium hover:underline">
                    {a.title}
                  </Link>
                  <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    {a.authorName && <span>{a.authorName}</span>}
                    {a.publishedAt && <span>{new Date(a.publishedAt).toLocaleDateString()}</span>}
                  </div>
                  {a.excerpt && <p className="text-sm text-muted-foreground">{a.excerpt}</p>}
                </div>
              </article>
            ))}
          </div>
        )}
        {pageInfo.hasNextPage && pageInfo.endCursor && (
          <div className="mt-8 flex justify-center">
            <Link
              href={`/blogs/${blog.handle}?cursor=${encodeURIComponent(pageInfo.endCursor)}`}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:border-foreground/30"
            >
              Next page →
            </Link>
          </div>
        )}
      </div>
      <RenderTemplate template={theme?.templates["blog.default"]} />
    </div>
  );
}
