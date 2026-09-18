import { Injectable } from "@nestjs/common";

import type { TenantContext } from "../../common/tenant/tenant-context";
import type { CalculatorContext, ShippingCalculator } from "../orders/calculators";
import { ShippingEligibilityService } from "./shipping-eligibility.service";

// Real Phase 7 implementation: uses the buyer's selected rate when it is still eligible,
// otherwise falls back to the cheapest eligible rate. No configured zones/rates => 0, so
// stores that have not set up shipping yet behave exactly like the Phase 6 zero-calculator.
@Injectable()
export class ShippingCalculatorService implements ShippingCalculator {
  constructor(private readonly eligibility: ShippingEligibilityService) {}

  async shippingTotal(input: CalculatorContext): Promise<number> {
    const ctx: Pick<TenantContext, "storeId"> = { storeId: input.storeId };
    const weightGrams = input.lines
      .filter((l) => l.requiresShipping)
      .reduce((sum, l) => sum + l.weightGrams, 0);
    const rate = await this.eligibility.resolveRate(ctx as TenantContext, {
      countryCode: input.shippingAddress?.countryCode ?? null,
      subtotal: input.subtotal,
      weightGrams,
      selectedRateId: input.selectedShippingRateId,
    });
    return rate?.price.amount ?? 0;
  }
}
