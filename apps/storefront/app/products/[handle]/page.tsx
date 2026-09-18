import { notFound } from "next/navigation";

import { AddToCartForm } from "@/components/add-to-cart-form";
import { RenderTemplate } from "@/components/renderer/render-template";
import { formatMoney } from "@/lib/money";
import { getProduct, getTheme } from "@/lib/storefront";

export default async function ProductPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const [product, theme] = await Promise.all([getProduct(handle), getTheme()]);
  if (!product) notFound();

  return (
    <div className="flex flex-col gap-12">
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-10 px-6 py-10 md:grid-cols-2">
        <div className="aspect-square overflow-hidden rounded-lg bg-muted">
          {product.media[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.media[0].url} alt={product.media[0].alt ?? product.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">No image</div>
          )}
        </div>
        <div className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">{product.title}</h1>
          {product.priceRange && (
            <p className="text-lg text-muted-foreground">
              {product.priceRange.min.amount === product.priceRange.max.amount
                ? formatMoney(product.priceRange.min)
                : `${formatMoney(product.priceRange.min)} – ${formatMoney(product.priceRange.max)}`}
            </p>
          )}
          <AddToCartForm variants={product.variants} />
          {product.descriptionHtml && (
            <div className="rich-text pt-4" dangerouslySetInnerHTML={{ __html: product.descriptionHtml }} />
          )}
        </div>
      </div>
      <RenderTemplate template={theme?.templates["product.default"]} />
    </div>
  );
}
