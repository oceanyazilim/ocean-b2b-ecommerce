import "server-only";

import type {
  MenuSummary,
  PageInfo,
  PaymentMethodSummary,
  ResolvedTheme,
  StorefrontArticleDetail,
  StorefrontArticleSummary,
  StorefrontBlogSummary,
  StorefrontCollectionDetail,
  StorefrontCollectionSummary,
  StorefrontPageDetail,
  StorefrontProductDetail,
  StorefrontProductSummary,
  StorefrontSearchResult,
} from "@ocean/types";
import { headers } from "next/headers";

import { storefrontFetch } from "./api";
import { getActiveLocale } from "./locale";

export const THEME_PREVIEW_HEADER = "x-theme-preview-token";

// The theme editor's iframe requests every page with `?preview_token=`, which middleware.ts
// turns into this request header (see its comment for why not a cookie); every other request
// keeps rendering the live published theme.
export async function getTheme(): Promise<ResolvedTheme | null> {
  const previewToken = (await headers()).get(THEME_PREVIEW_HEADER);
  const res = previewToken
    ? await storefrontFetch<{ data: ResolvedTheme | null }>(`/theme/preview?token=${encodeURIComponent(previewToken)}`)
    : await storefrontFetch<{ data: ResolvedTheme | null }>("/theme");
  return res.data;
}

export async function getContext(): Promise<{ storeId: string; signedIn: boolean }> {
  const res = await storefrontFetch<{ data: { storeId: string; signedIn: boolean } }>("/context");
  return res.data;
}

export async function listProducts(
  params: { q?: string; collectionHandle?: string; limit?: number } = {},
): Promise<StorefrontProductSummary[]> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.collectionHandle) qs.set("collectionHandle", params.collectionHandle);
  qs.set("limit", String(params.limit ?? 24));
  // L4 Global Localization: only sent when the buyer is browsing in a non-default language —
  // the API falls back to default-language content either way, this just saves it the lookup.
  const { locale, isDefault } = await getActiveLocale();
  if (!isDefault) qs.set("locale", locale);
  const res = await storefrontFetch<{ data: StorefrontProductSummary[] }>(`/products?${qs.toString()}`);
  return res.data;
}

// Real full-text search (Meilisearch-backed, typo-tolerant) — see GET /storefront/v1/search.
export async function searchProducts(q: string, limit = 24): Promise<StorefrontSearchResult> {
  if (!q.trim()) return { query: q, products: [] };
  const qs = new URLSearchParams({ q, limit: String(limit) });
  const res = await storefrontFetch<{ data: StorefrontSearchResult }>(`/search?${qs.toString()}`);
  return res.data;
}

export async function getProduct(idOrHandle: string): Promise<StorefrontProductDetail | null> {
  try {
    const { locale, isDefault } = await getActiveLocale();
    const qs = !isDefault ? `?locale=${encodeURIComponent(locale)}` : "";
    const res = await storefrontFetch<{ data: StorefrontProductDetail }>(
      `/products/${encodeURIComponent(idOrHandle)}${qs}`,
    );
    return res.data;
  } catch {
    return null;
  }
}

export async function listCollections(): Promise<StorefrontCollectionSummary[]> {
  const res = await storefrontFetch<{ data: StorefrontCollectionSummary[] }>("/collections?limit=50");
  return res.data;
}

export async function getCollection(handle: string): Promise<StorefrontCollectionDetail | null> {
  try {
    const res = await storefrontFetch<{ data: StorefrontCollectionDetail }>(
      `/collections/${encodeURIComponent(handle)}`,
    );
    return res.data;
  } catch {
    return null;
  }
}

export async function getPage(handle: string): Promise<StorefrontPageDetail | null> {
  try {
    const res = await storefrontFetch<{ data: StorefrontPageDetail }>(`/pages/${encodeURIComponent(handle)}`);
    return res.data;
  } catch {
    return null;
  }
}

export async function listBlogs(): Promise<StorefrontBlogSummary[]> {
  const res = await storefrontFetch<{ data: StorefrontBlogSummary[] }>("/blogs");
  return res.data;
}

export async function getBlogArticles(
  handle: string,
  params: { cursor?: string; limit?: number } = {},
): Promise<{ blog: StorefrontBlogSummary; articles: StorefrontArticleSummary[]; pageInfo: PageInfo } | null> {
  try {
    const qs = new URLSearchParams();
    if (params.cursor) qs.set("cursor", params.cursor);
    qs.set("limit", String(params.limit ?? 12));
    const res = await storefrontFetch<{
      data: { blog: StorefrontBlogSummary; articles: { data: StorefrontArticleSummary[]; pageInfo: PageInfo } };
    }>(`/blogs/${encodeURIComponent(handle)}?${qs.toString()}`);
    return { blog: res.data.blog, articles: res.data.articles.data, pageInfo: res.data.articles.pageInfo };
  } catch {
    return null;
  }
}

export async function getArticle(blogHandle: string, articleHandle: string): Promise<StorefrontArticleDetail | null> {
  try {
    const res = await storefrontFetch<{ data: StorefrontArticleDetail }>(
      `/blogs/${encodeURIComponent(blogHandle)}/articles/${encodeURIComponent(articleHandle)}`,
    );
    return res.data;
  } catch {
    return null;
  }
}

export async function listMenus(): Promise<MenuSummary[]> {
  const res = await storefrontFetch<{ data: MenuSummary[] }>("/menus");
  return res.data;
}

export async function listPaymentMethods(): Promise<PaymentMethodSummary[]> {
  const res = await storefrontFetch<{ data: PaymentMethodSummary[] }>("/payment-methods");
  return res.data;
}
