import type { Metadata } from "next";
import Link from "next/link";

import { ProductCard } from "@/components/product-card";
import { searchProducts } from "@/lib/storefront";

export const metadata: Metadata = {
  title: "Search",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const result = query ? await searchProducts(query) : null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">
        {query ? `Search results for "${query}"` : "Search"}
      </h1>

      {!query && <p className="text-sm text-muted-foreground">Type something in the search box above to get started.</p>}

      {query && result && (
        <>
          <p className="mb-6 text-sm text-muted-foreground">
            {result.products.length === 0
              ? "No products matched your search."
              : `${result.products.length} product${result.products.length === 1 ? "" : "s"} found`}
          </p>
          {result.products.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-center">
              <p className="text-sm font-medium">We couldn&apos;t find anything for &quot;{query}&quot;.</p>
              <p className="text-sm text-muted-foreground">
                Try a different spelling, a more general term, or browse our{" "}
                <Link href="/collections" className="text-primary hover:underline">
                  collections
                </Link>{" "}
                instead.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {result.products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
