import type { Address } from "@ocean/types";

// Shipping and tax are their own domains (Phase 7). Checkout depends on these interfaces
// only; the zero implementations below keep Phase 6 orders correct (no shipping, no tax)
// until real calculators are bound to the tokens.

export interface CalculatorLine {
  variantId: string;
  productId: string | null;
  quantity: number;
  lineTotal: number;
  requiresShipping: boolean;
  taxable: boolean;
}

export interface CalculatorContext {
  storeId: string;
  currency: string;
  companyId: string | null;
  companyLocationId: string | null;
  customerId: string | null;
  shippingAddress: Address | null;
  billingAddress: Address | null;
  lines: CalculatorLine[];
  subtotal: number;
}

export interface ShippingCalculator {
  // Minor units for the whole order.
  shippingTotal(input: CalculatorContext): Promise<number>;
}

export interface TaxCalculator {
  // Minor units per line (same order as input.lines) plus the total.
  taxes(input: CalculatorContext): Promise<{ perLine: number[]; total: number }>;
}

export const SHIPPING_CALCULATOR = Symbol("SHIPPING_CALCULATOR");
export const TAX_CALCULATOR = Symbol("TAX_CALCULATOR");

export class ZeroShippingCalculator implements ShippingCalculator {
  shippingTotal(): Promise<number> {
    return Promise.resolve(0);
  }
}

export class ZeroTaxCalculator implements TaxCalculator {
  taxes(input: CalculatorContext): Promise<{ perLine: number[]; total: number }> {
    return Promise.resolve({ perLine: input.lines.map(() => 0), total: 0 });
  }
}
