import { z } from "zod";

import { currencyCodeSchema } from "./primitives";

// ---------------------------------------------------------------------------
// L5 Global Localization (half B): Finance -> Invoicing configuration (spec section 28) and the
// e-invoicing provider-connection abstraction (spec section 29). See InvoiceSettings/
// EInvoiceProviderConnection in packages/db's schema.prisma for the persistence-layer comments.
// ---------------------------------------------------------------------------

// ---- invoice settings ------------------------------------------------------------------------

export const bankInfoSchema = z.object({
  bankName: z.string().trim().max(160).optional(),
  accountName: z.string().trim().max(160).optional(),
  // IBAN in markets that use it (TR/DE/...), plain account number elsewhere (US/GB/...).
  accountNumber: z.string().trim().max(80).optional(),
  swiftBic: z.string().trim().max(20).optional(),
  // Free text for whatever a market's third routing identifier is (US routing number, GB sort
  // code, ...) rather than a hardcoded field per country.
  routingDetail: z.string().trim().max(160).optional(),
});
export type BankInfo = z.infer<typeof bankInfoSchema>;

export const updateInvoiceSettingsSchema = z.object({
  invoicePrefix: z.string().trim().min(1).max(20).optional(),
  numberingStart: z.number().int().min(1).max(999_999_999).nullable().optional(),
  legalName: z.string().trim().max(200).nullable().optional(),
  taxId: z.string().trim().max(80).nullable().optional(),
  registeredAddress: z.string().trim().max(2000).nullable().optional(),
  bankInfo: bankInfoSchema.nullable().optional(),
  footerNotice: z.string().trim().max(2000).nullable().optional(),
  currency: currencyCodeSchema.nullable().optional(),
  language: z.string().trim().max(20).nullable().optional(),
});
export type UpdateInvoiceSettingsInput = z.infer<typeof updateInvoiceSettingsSchema>;

export interface InvoiceSettingsSummary {
  storeId: string;
  invoicePrefix: string;
  // Only ever applied once, to a store with zero invoices issued so far — see
  // InvoicingSettingsService.update. Once a store has invoices, this is informational only
  // (echoes the last value saved, but no longer changes Store.invoiceSequence).
  numberingStart: number | null;
  // Whether numberingStart (if set) could still be applied — false once the store has any real
  // invoices, so the admin UI can explain why the field is now inert.
  numberingCanApply: boolean;
  legalName: string | null;
  taxId: string | null;
  registeredAddress: string | null;
  bankInfo: BankInfo | null;
  footerNotice: string | null;
  currency: string;
  language: string;
  // True once a merchant has saved this store's own settings row; false while every field above
  // is still a computed default (Organization name, Store defaults, etc.) with nothing persisted.
  configured: boolean;
  updatedAt: string | null;
}

// The issuer snapshot embedded into InvoiceDetail (finance.service.ts's toDetail) — the live
// wiring of this configuration layer into the one real "invoice output" surface this codebase
// has today (there is no PDF/document generator; see the L5 commit message for that boundary).
export interface InvoiceIssuerSnapshot {
  legalName: string | null;
  taxId: string | null;
  registeredAddress: string | null;
  bankInfo: BankInfo | null;
  footerNotice: string | null;
}

// ---- e-invoicing provider connections --------------------------------------------------------

export const E_INVOICE_PROVIDER_CATEGORIES = [
  "electronic_invoice_provider",
  "government_tax_platform",
  "certified_third_party",
  "accounting_platform",
] as const;
export const eInvoiceProviderCategorySchema = z.enum(E_INVOICE_PROVIDER_CATEGORIES);
export type EInvoiceProviderCategory = z.infer<typeof eInvoiceProviderCategorySchema>;

export const E_INVOICE_CONNECTION_STATUSES = ["disconnected", "action_required", "connected"] as const;
export const eInvoiceConnectionStatusSchema = z.enum(E_INVOICE_CONNECTION_STATUSES);
export type EInvoiceConnectionStatus = z.infer<typeof eInvoiceConnectionStatusSchema>;

export const upsertEInvoiceConnectionSchema = z.object({
  category: eInvoiceProviderCategorySchema,
  providerName: z.string().trim().min(1).max(120),
  accountIdentifier: z.string().trim().max(120).nullable().optional(),
  // Write-only: accepted here to compute `status`/`hasCredential`, never persisted or echoed
  // back — see EInvoiceProviderConnection's schema.prisma comment.
  credential: z.string().trim().max(500).nullable().optional(),
});
export type UpsertEInvoiceConnectionInput = z.infer<typeof upsertEInvoiceConnectionSchema>;

export interface EInvoiceConnectionSummary {
  id: string;
  category: EInvoiceProviderCategory;
  providerName: string;
  accountIdentifier: string | null;
  hasCredential: boolean;
  status: EInvoiceConnectionStatus;
  statusDetail: string | null;
  connectedAt: string | null;
  updatedAt: string;
}

// ---- Platform Admin -> Countries (spec section 32) -------------------------------------------

// Admin-language support is fixed platform-wide (only TR/EN exist per L1's admin i18n phase),
// never per-country — shown as a static note by the Countries screen, not sourced from this type.
export const PLATFORM_ADMIN_LANGUAGES = ["tr", "en"] as const;

export interface PlatformCountrySummary {
  countryCode: string;
  name: string;
  isActive: boolean;
  version: string;
  // = CountryProfile.supportedLanguages (storefront locales this country ships translations for,
  // per L4 — e.g. ["tr-TR", "en-US"]).
  storefrontLocales: string[];
  // = supportedCurrencies[0] (first-listed currency, the country's primary/default one).
  defaultCurrency: string | null;
  // Each "Configured" / "Not configured" flag is computed from whether the matching
  // CountryProfile JSON column actually has content — never hardcoded.
  taxEngineConfigured: boolean;
  businessSchemaCount: number;
  addressSchemaConfigured: boolean;
  // Number of real, merchant-saved InvoiceSettings rows (see InvoiceSettings) belonging to a
  // store whose Organization.businessCountryCode is this country — "Configured" once at least
  // one store trading from this country has real invoicing settings; there's no single
  // country-wide invoice-configuration concept in a multi-tenant platform (each store configures
  // its own), so this reports a count rather than a single "Configured"/"Not configured" flag on
  // its own, but see `invoiceConfigurationConfigured` for the section-32-shaped boolean.
  invoiceConfiguredStoreCount: number;
  invoiceConfigurationConfigured: boolean;
  createdAt: string;
  updatedAt: string;
}
