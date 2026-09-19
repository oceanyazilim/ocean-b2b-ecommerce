import type { ThemeSectionInstance } from "@ocean/types";

import { ProductCard } from "@/components/product-card";
import { listProducts } from "@/lib/storefront";

export async function FeaturedProducts({ section }: { section: ThemeSectionInstance }) {
  const title = String(section.settings.title ?? "Featured products");
  const collectionHandle = typeof section.settings.collectionHandle === "string" ? section.settings.collectionHandle : "";
  const products = await listProducts(collectionHandle ? { collectionHandle, limit: 8 } : { limit: 8 });
  if (products.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-6 py-14 sm:px-12">
      <h2 className="mb-6 text-2xl font-semibold tracking-tight">{title}</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}
