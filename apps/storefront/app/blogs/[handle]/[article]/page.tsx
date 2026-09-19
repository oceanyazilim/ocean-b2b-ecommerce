import { notFound } from "next/navigation";
import Link from "next/link";

import { RenderTemplate } from "@/components/renderer/render-template";
import { getArticle, getTheme } from "@/lib/storefront";

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ handle: string; article: string }>;
}) {
  const { handle, article: articleHandle } = await params;
  const [article, theme] = await Promise.all([getArticle(handle, articleHandle), getTheme()]);
  if (!article) notFound();

  return (
    <div className="flex flex-col gap-12">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <Link href={`/blogs/${article.blog.handle}`} className="text-sm text-muted-foreground hover:underline">
          ← {article.blog.title}
        </Link>
        <h1 className="mb-2 mt-4 text-2xl font-semibold tracking-tight">{article.title}</h1>
        <div className="mb-6 flex flex-wrap gap-x-3 text-sm text-muted-foreground">
          {article.authorName && <span>By {article.authorName}</span>}
          {article.publishedAt && <span>{new Date(article.publishedAt).toLocaleDateString()}</span>}
        </div>
        {article.featuredImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.featuredImage.url}
            alt={article.featuredImage.alt ?? article.title}
            className="mb-8 aspect-video w-full rounded-lg object-cover"
          />
        )}
        {article.bodyRich?.html && (
          <div className="rich-text" dangerouslySetInnerHTML={{ __html: article.bodyRich.html }} />
        )}
        {article.tags.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-2">
            {article.tags.map((t) => (
              <span key={t} className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
      <RenderTemplate template={theme?.templates["article.default"]} />
    </div>
  );
}
