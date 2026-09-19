import type { StorefrontProductSummary } from "@ocean/types";
import Link from "next/link";

import { formatMoney } from "@/lib/money";

export function ProductCard({ product }: { product: StorefrontProductSummary }) {
  return (
    <Link
      href={`/products/${product.handle}`}
      className="group flex flex-col gap-3 rounded-xl border bg-background p-3 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-popover"
    >
      <div className="aspect-square overflow-hidden rounded-lg bg-muted">
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image.url}
            alt={product.image.alt ?? product.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            No image
          </div>
        )}
      </div>
      <div className="flex flex-col gap-0.5 px-0.5 pb-1">
        <span className="line-clamp-2 text-sm font-medium">{product.title}</span>
        {product.priceRange && (
          <span className="text-sm font-semibold text-foreground">
            {product.priceRange.min.amount === product.priceRange.max.amount
              ? formatMoney(product.priceRange.min)
              : `${formatMoney(product.priceRange.min)} – ${formatMoney(product.priceRange.max)}`}
          </span>
        )}
      </div>
    </Link>
  );
}
