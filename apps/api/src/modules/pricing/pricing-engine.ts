import type { PriceSource, QuantityRuleCheck, VolumeTier, VolumeTierType } from "@ocean/types";

// Pure arithmetic behind PricingService. No I/O, no Prisma: everything here is unit-tested and
// safe to reuse from carts, checkout and the storefront API.

// Applies basis points to a minor-unit amount, rounding half up and never going below zero.
export function applyBps(amount: number, bps: number): number {
  if (bps === 0) return amount;
  const adjusted = Math.round((amount * (10_000 + bps)) / 10_000);
  return Math.max(0, adjusted);
}

// Tiers are stored sorted by minQuantity ascending; the last tier the quantity reaches wins.
export function selectTier(tiers: readonly VolumeTier[], quantity: number): VolumeTier | null {
  let match: VolumeTier | null = null;
  for (const tier of tiers) {
    if (quantity >= tier.minQuantity) match = tier;
    else break;
  }
  return match;
}

export function tierUnitPrice(tierType: VolumeTierType, tier: VolumeTier, basis: number): number {
  return tierType === "fixed_price" ? tier.value : applyBps(basis, -tier.value);
}

export interface VolumeRuleInput {
  id: string;
  tierType: VolumeTierType;
  tiers: readonly VolumeTier[];
}

export interface ResolvePriceInput {
  basePrice: number;
  quantity: number;
  contract: { id: string; price: number } | null;
  priceList: { id: string; explicitPrice: number | null; adjustmentBps: number } | null;
  volumeRule: VolumeRuleInput | null;
}

export interface ResolvedPrice {
  unitPrice: number;
  source: PriceSource;
  priceListId: string | null;
  contractPriceId: string | null;
  volumeRuleId: string | null;
  appliedTier: VolumeTier | null;
  tiers: { minQuantity: number; unitPrice: number }[];
}

// Precedence (spec §21): contract price → price list (explicit, else base adjusted by the
// list's percentage) → volume tier on top of that basis → base price. A contract price is
// final: tiers never discount it further.
export function resolvePrice(input: ResolvePriceInput): ResolvedPrice {
  if (input.contract) {
    return {
      unitPrice: input.contract.price,
      source: "contract",
      priceListId: null,
      contractPriceId: input.contract.id,
      volumeRuleId: null,
      appliedTier: null,
      tiers: [],
    };
  }

  let basis = input.basePrice;
  let source: PriceSource = "base";
  if (input.priceList) {
    basis =
      input.priceList.explicitPrice ?? applyBps(input.basePrice, input.priceList.adjustmentBps);
    source = "price_list";
  }

  if (!input.volumeRule) {
    return {
      unitPrice: basis,
      source,
      priceListId: input.priceList?.id ?? null,
      contractPriceId: null,
      volumeRuleId: null,
      appliedTier: null,
      tiers: [],
    };
  }

  const tiers = input.volumeRule.tiers.map((tier) => ({
    minQuantity: tier.minQuantity,
    unitPrice: tierUnitPrice(input.volumeRule!.tierType, tier, basis),
  }));
  const applied = selectTier(input.volumeRule.tiers, input.quantity);
  const unitPrice = applied ? tierUnitPrice(input.volumeRule.tierType, applied, basis) : basis;
  return {
    unitPrice,
    source: applied ? "volume" : source,
    priceListId: input.priceList?.id ?? null,
    contractPriceId: null,
    volumeRuleId: input.volumeRule.id,
    appliedTier: applied,
    tiers,
  };
}

export interface QuantityRuleInput {
  minQuantity: number | null;
  maxQuantity: number | null;
  increment: number | null;
}

// Validates a quantity and, when it fails, proposes the nearest quantity that passes: rounded up
// to the increment, then clamped into [min, max] (rounding max down to the increment).
export function checkQuantityRule(
  rule: QuantityRuleInput | null,
  quantity: number,
): QuantityRuleCheck {
  const none: QuantityRuleCheck = {
    ok: true,
    minQuantity: rule?.minQuantity ?? null,
    maxQuantity: rule?.maxQuantity ?? null,
    increment: rule?.increment ?? null,
    suggestedQuantity: null,
    message: null,
  };
  if (!rule) return none;

  const { minQuantity, maxQuantity, increment } = rule;
  const problems: string[] = [];
  if (minQuantity !== null && quantity < minQuantity) {
    problems.push(`Minimum order quantity is ${minQuantity}`);
  }
  if (maxQuantity !== null && quantity > maxQuantity) {
    problems.push(`Maximum order quantity is ${maxQuantity}`);
  }
  if (increment !== null && increment > 1 && quantity % increment !== 0) {
    problems.push(`Order in multiples of ${increment}`);
  }
  if (problems.length === 0) return none;

  let suggested = quantity;
  if (minQuantity !== null && suggested < minQuantity) suggested = minQuantity;
  if (increment !== null && increment > 1 && suggested % increment !== 0) {
    suggested = Math.ceil(suggested / increment) * increment;
  }
  if (maxQuantity !== null && suggested > maxQuantity) {
    suggested =
      increment !== null && increment > 1
        ? Math.floor(maxQuantity / increment) * increment
        : maxQuantity;
    if (minQuantity !== null && suggested < minQuantity) suggested = minQuantity;
  }
  return {
    ...none,
    ok: false,
    suggestedQuantity: suggested >= 1 ? suggested : null,
    message: problems.join(". ") + ".",
  };
}
