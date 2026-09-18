import type { Address } from "@ocean/types";

// Shipping and tax are their own domains (shipping/calculator.ts, tax/calculator.ts). Checkout
// depends only on these interfaces and the DI tokens below, never on the concrete services.

export interface CalculatorLine {
  variantId: string;
  productId: string | null;
  quantity: number;
  lineTotal: number;
  requiresShipping: boolean;
  taxable: boolean;
  weightGrams: number;
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
  // Rate the buyer (or staff) explicitly picked, from Cart/DraftOrder.shippingRateId. The real
  // calculator validates it is still eligible before trusting it; falls back to auto-selecting
  // the cheapest eligible rate when absent or no longer valid.
  selectedShippingRateId: string | null;
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
