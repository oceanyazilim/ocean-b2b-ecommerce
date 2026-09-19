import "server-only";

import type {
  CompanyDetail,
  CompanyUserSummary,
  CreditAccountSummary,
  CustomerAddressSummary,
  CustomerDetail,
  InvoiceDetail,
  InvoiceSummary,
  OrderDetail,
  OrderSummary,
  Paginated,
  QuoteDetail,
  QuoteSummary,
} from "@ocean/types";

import { storefrontFetch } from "./api";

// Server-side reads for the buyer account portal (/account/*). Mirrors lib/storefront.ts's
// conventions: GET-only (storefrontFetch can't relay Set-Cookie), a `.data` unwrap for a single
// resource, and the raw response for a Paginated<T> list (it already has the {data, pageInfo}
// shape the API returns). Mutations (team invite/update, addresses) live in client components
// and go through lib/client-api.ts's `api()` instead — see components/*-form.tsx.

export async function getAccountProfile(): Promise<CustomerDetail> {
  const res = await storefrontFetch<{ data: CustomerDetail }>("/account/profile");
  return res.data;
}

export async function listAccountOrders(limit = 20): Promise<Paginated<OrderSummary>> {
  return storefrontFetch<Paginated<OrderSummary>>(`/account/orders?limit=${limit}`);
}

export async function getAccountOrder(id: string): Promise<OrderDetail | null> {
  try {
    const res = await storefrontFetch<{ data: OrderDetail }>(`/account/orders/${encodeURIComponent(id)}`);
    return res.data;
  } catch {
    return null;
  }
}

export async function listAccountQuotes(limit = 20): Promise<Paginated<QuoteSummary>> {
  return storefrontFetch<Paginated<QuoteSummary>>(`/account/quotes?limit=${limit}`);
}

export async function getAccountQuote(id: string): Promise<QuoteDetail | null> {
  try {
    const res = await storefrontFetch<{ data: QuoteDetail }>(`/account/quotes/${encodeURIComponent(id)}`);
    return res.data;
  } catch {
    return null;
  }
}

export async function listAccountInvoices(limit = 20): Promise<Paginated<InvoiceSummary>> {
  return storefrontFetch<Paginated<InvoiceSummary>>(`/account/invoices?limit=${limit}`);
}

export async function getAccountInvoice(id: string): Promise<InvoiceDetail | null> {
  try {
    const res = await storefrontFetch<{ data: InvoiceDetail }>(`/account/invoices/${encodeURIComponent(id)}`);
    return res.data;
  } catch {
    return null;
  }
}

export async function listAccountCredit(): Promise<CreditAccountSummary[]> {
  const res = await storefrontFetch<{ data: CreditAccountSummary[] }>("/account/credit");
  return res.data;
}

export async function getAccountCompany(): Promise<CompanyDetail | null> {
  try {
    const res = await storefrontFetch<{ data: CompanyDetail }>("/account/company");
    return res.data;
  } catch {
    return null;
  }
}

export async function listAccountTeam(): Promise<CompanyUserSummary[]> {
  const res = await storefrontFetch<{ data: CompanyUserSummary[] }>("/account/team");
  return res.data;
}

export async function listAccountAddresses(): Promise<CustomerAddressSummary[]> {
  const res = await storefrontFetch<{ data: CustomerAddressSummary[] }>("/account/addresses");
  return res.data;
}
