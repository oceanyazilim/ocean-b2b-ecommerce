import type { CalculatorContext } from "../orders/calculators";

// ---------------------------------------------------------------------------
// Spec section 50: "Design the tax engine so external services can be integrated." This
// interface is the seam — TaxCalculatorService (checkout/orders) and TaxService (the Settings ->
// Taxes UI) both depend on TAX_PROVIDER rather than a concrete implementation, so a future real
// external provider (Avalara, TaxJar, ...) can be wired in later without touching either caller
// or the admin UI. Today exactly one provider is registered (ManualTaxProvider, wrapping the
// real Phase 7/L3 TaxRule engine) — this file defines the contract that a second, genuinely
// different provider would also have to satisfy.
// ---------------------------------------------------------------------------

export interface TaxRateLookup {
  rateBps: number;
  ruleId: string;
  ruleName: string;
}

export interface ProductTaxCategory {
  taxClassId: string;
  code: string;
  name: string;
}

export interface TaxRegistrationLookup {
  countryCode: string;
  regionCode: string | null;
  registrationType: string;
  status: string;
}

export interface TaxIdValidationResult {
  valid: boolean;
  // The local label for the id format matched (or the first known format for the country, when
  // no specific type was given) — e.g. "VKN", "VAT ID" — null when the country has no known
  // formats to check against (in which case `valid` is true: nothing to reject it on).
  formatLabel: string | null;
}

export interface TaxProvider {
  readonly id: string;
  readonly name: string;
  // Spec section 51: "clearly distinguish: Automatically calculated vs Manually configured."
  // False for every provider until a real external tax service is connected.
  readonly isAutomatic: boolean;

  calculateTax(input: CalculatorContext): Promise<{ perLine: number[]; total: number }>;

  validateTaxID(
    countryCode: string,
    taxId: string,
    taxIdType?: string | null,
  ): Promise<TaxIdValidationResult>;

  getTaxRate(
    storeId: string,
    countryCode: string,
    provinceCode: string | null,
    taxClassId: string | null,
  ): Promise<TaxRateLookup | null>;

  getProductTaxCategory(storeId: string, productId: string): Promise<ProductTaxCategory | null>;

  getTaxRegistrations(storeId: string, organizationId: string): Promise<TaxRegistrationLookup[]>;
}

export const TAX_PROVIDER = Symbol("TAX_PROVIDER");
