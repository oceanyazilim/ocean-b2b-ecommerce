import { notFound } from "next/navigation";

import { RenderTemplate } from "@/components/renderer/render-template";
import { getPage, getTheme } from "@/lib/storefront";

export default async function ContentPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const [page, theme] = await Promise.all([getPage(handle), getTheme()]);
  if (!page) notFound();

  return (
    <div className="flex flex-col gap-12">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">{page.title}</h1>
        {page.bodyRich?.html && (
          <div className="rich-text" dangerouslySetInnerHTML={{ __html: page.bodyRich.html }} />
        )}
      </div>
      <RenderTemplate template={theme?.templates["page.default"]} />
    </div>
  );
}
