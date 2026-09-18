import { notFound } from "next/navigation";

import { ProductCard } from "@/components/product-card";
import { RenderTemplate } from "@/components/renderer/render-template";
import { getCollection, getTheme } from "@/lib/storefront";

export default async function CollectionPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const [collection, theme] = await Promise.all([getCollection(handle), getTheme()]);
  if (!collection) notFound();

  return (
    <div className="flex flex-col gap-12">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">{collection.title}</h1>
        {collection.descriptionHtml && (
          <div className="rich-text mb-6 text-muted-foreground" dangerouslySetInnerHTML={{ __html: collection.descriptionHtml }} />
        )}
        {collection.products.length === 0 ? (
          <p className="text-sm text-muted-foreground">No products in this collection yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {collection.products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>
      <RenderTemplate template={theme?.templates["collection.default"]} />
    </div>
  );
}
