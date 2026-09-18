import "server-only";

import type {
  MenuSummary,
  PaymentMethodSummary,
  ResolvedTheme,
  StorefrontCollectionDetail,
  StorefrontCollectionSummary,
  StorefrontPageDetail,
  StorefrontProductDetail,
  StorefrontProductSummary,
} from "@ocean/types";

import { storefrontFetch } from "./api";

export async function getTheme(): Promise<ResolvedTheme | null> {
  const res = await storefrontFetch<{ data: ResolvedTheme | null }>("/theme");
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
  const res = await storefrontFetch<{ data: StorefrontProductSummary[] }>(`/products?${qs.toString()}`);
  return res.data;
}

export async function getProduct(idOrHandle: string): Promise<StorefrontProductDetail | null> {
  try {
    const res = await storefrontFetch<{ data: StorefrontProductDetail }>(
      `/products/${encodeURIComponent(idOrHandle)}`,
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

export async function listMenus(): Promise<MenuSummary[]> {
  const res = await storefrontFetch<{ data: MenuSummary[] }>("/menus");
  return res.data;
}

export async function listPaymentMethods(): Promise<PaymentMethodSummary[]> {
  const res = await storefrontFetch<{ data: PaymentMethodSummary[] }>("/payment-methods");
  return res.data;
}
