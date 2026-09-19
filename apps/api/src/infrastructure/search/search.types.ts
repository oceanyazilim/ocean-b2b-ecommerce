// One Meilisearch document per Product. Kept intentionally small — this is a "which product ids
// matched the query" index, never a source of truth for price/availability/visibility. Every
// field here is denormalized purely for text matching and simple filtering.
export interface SearchProductDocument {
  id: string;
  title: string;
  handle: string;
  vendor: string;
  productType: string;
  tags: string[];
  description: string;
  variantSkus: string[];
  variantTitles: string[];
  // Filterable: the storefront query always restricts to "active" so a draft/archived product
  // that hasn't been removed from the index yet can never surface as a search result. This is a
  // performance/hygiene filter, not a security boundary — CatalogAccessService + a fresh Postgres
  // read of matched ids is the actual security boundary (see StorefrontSearchService).
  status: string;
  createdAt: number;
}
