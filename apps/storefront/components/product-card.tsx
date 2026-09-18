import type { StorefrontProductSummary } from "@ocean/types";
import Link from "next/link";

import { formatMoney } from "@/lib/money";

export function ProductCard({ product }: { product: StorefrontProductSummary }) {
  return (
    <Link
      href={`/products/${product.handle}`}
      className="group flex flex-col gap-2 rounded-lg border p-3 transition-colors hover:border-foreground/30"
    >
      <div className="aspect-square overflow-hidden rounded-md bg-muted">
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image.url}
            alt={product.image.alt ?? product.title}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            No image
          </div>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="line-clamp-2 text-sm font-medium">{product.title}</span>
        {product.priceRange && (
          <span className="text-sm text-muted-foreground">
            {product.priceRange.min.amount === product.priceRange.max.amount
              ? formatMoney(product.priceRange.min)
              : `${formatMoney(product.priceRange.min)} – ${formatMoney(product.priceRange.max)}`}
          </span>
        )}
      </div>
    </Link>
  );
}
