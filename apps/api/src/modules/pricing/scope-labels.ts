import type { Prisma } from "@ocean/db";

// Human labels for rule scopes ("Steel Bolt · M6", "Collection: Fasteners") resolved in one
// round-trip per scope type so list screens stay readable without extra requests.
export async function resolveScopeLabels(
  tx: Prisma.TransactionClient,
  storeId: string,
  refs: readonly { scope: string; scopeId: string | null }[],
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  const ids = (scope: string) => [
    ...new Set(refs.filter((r) => r.scope === scope && r.scopeId).map((r) => r.scopeId!)),
  ];

  const variantIds = ids("variant");
  if (variantIds.length) {
    const rows = await tx.productVariant.findMany({
      where: { storeId, id: { in: variantIds } },
      select: { id: true, title: true, sku: true, product: { select: { title: true } } },
    });
    for (const v of rows) {
      const variant = v.title === "Default Title" ? "" : ` · ${v.title}`;
      labels.set(`variant:${v.id}`, `${v.product.title}${variant}${v.sku ? ` (${v.sku})` : ""}`);
    }
  }
  const productIds = ids("product");
  if (productIds.length) {
    const rows = await tx.product.findMany({
      where: { storeId, id: { in: productIds } },
      select: { id: true, title: true },
    });
    for (const p of rows) labels.set(`product:${p.id}`, p.title);
  }
  const collectionIds = ids("collection");
  if (collectionIds.length) {
    const rows = await tx.collection.findMany({
      where: { storeId, id: { in: collectionIds } },
      select: { id: true, title: true },
    });
    for (const c of rows) labels.set(`collection:${c.id}`, `Collection: ${c.title}`);
  }
  return labels;
}

export function scopeLabel(
  labels: Map<string, string>,
  scope: string,
  scopeId: string | null,
): string {
  if (scope === "store") return "Whole store";
  return labels.get(`${scope}:${scopeId}`) ?? `${scope} (removed)`;
}
