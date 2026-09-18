import { Injectable } from "@nestjs/common";
import type { EligibleShippingRate } from "@ocean/types";

import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { toMoney } from "../catalog/money";

export interface EligibilityInput {
  countryCode: string | null;
  subtotal: number;
  weightGrams: number;
}

// Shared by the checkout ShippingCalculator (calculator.ts) and cart/draft-order rendering
// (which lists options for the buyer to pick from). A zone matches on an exact country code
// first; "*" zones (everywhere else) only apply when nothing more specific does.
@Injectable()
export class ShippingEligibilityService {
  constructor(private readonly prisma: PrismaService) {}

  async eligibleRates(ctx: TenantContext, input: EligibilityInput): Promise<EligibleShippingRate[]> {
    const storeId = ctx.storeId as string;
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { defaultCurrency: true },
    });
    const currency = store?.defaultCurrency ?? "TRY";

    const zones = await this.prisma.shippingZone.findMany({
      where: { storeId, isActive: true },
      include: {
        rates: {
          where: {
            isActive: true,
            AND: [
              { OR: [{ minSubtotal: null }, { minSubtotal: { lte: input.subtotal } }] },
              { OR: [{ maxSubtotal: null }, { maxSubtotal: { gte: input.subtotal } }] },
              { OR: [{ minWeightGrams: null }, { minWeightGrams: { lte: input.weightGrams } }] },
              { OR: [{ maxWeightGrams: null }, { maxWeightGrams: { gte: input.weightGrams } }] },
            ],
          },
        },
      },
    });

    const specific = input.countryCode
      ? zones.filter((z) => z.countries.includes(input.countryCode!))
      : [];
    const matchedZones = specific.length > 0 ? specific : zones.filter((z) => z.countries.includes("*"));

    return matchedZones
      .flatMap((zone) =>
        zone.rates.map((rate) => ({
          id: rate.id,
          zoneId: zone.id,
          zoneName: zone.name,
          name: rate.name,
          description: rate.description,
          type: rate.type,
          price: toMoney(rate.price, currency),
        })),
      )
      .sort((a, b) => a.price.amount - b.price.amount);
  }

  // The buyer's selection when it is still eligible, else the cheapest eligible rate, else
  // null (no shipping configured). Shared so checkout and the ShippingCalculator agree.
  async resolveRate(
    ctx: TenantContext,
    input: EligibilityInput & { selectedRateId: string | null },
  ): Promise<EligibleShippingRate | null> {
    const rates = await this.eligibleRates(ctx, input);
    const first = rates[0];
    if (!first) return null;
    const selected = input.selectedRateId ? rates.find((r) => r.id === input.selectedRateId) : undefined;
    return selected ?? first;
  }
}
