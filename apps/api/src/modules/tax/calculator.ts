import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import type { CalculatorContext, TaxCalculator } from "../orders/calculators";

// Real Phase 7 implementation: the most specific active rule for the shipping address wins
// (province beats country-only). No matching rule => 0 tax on that line. `pricesIncludeTax`
// decides whether the line total already contains the tax (extract) or needs it added on top.
@Injectable()
export class TaxCalculatorService implements TaxCalculator {
  constructor(private readonly prisma: PrismaService) {}

  async taxes(input: CalculatorContext): Promise<{ perLine: number[]; total: number }> {
    const address = input.shippingAddress ?? input.billingAddress;
    if (!address) return { perLine: input.lines.map(() => 0), total: 0 };

    const store = await this.prisma.store.findUnique({
      where: { id: input.storeId },
      select: { pricesIncludeTax: true },
    });
    const inclusive = store?.pricesIncludeTax ?? false;

    const rules = await this.prisma.taxRule.findMany({
      where: { storeId: input.storeId, isActive: true, countryCode: address.countryCode },
    });
    if (rules.length === 0) return { perLine: input.lines.map(() => 0), total: 0 };

    const byProvince = rules.find(
      (r) => r.provinceCode && r.provinceCode === (address.provinceCode ?? null),
    );
    const countryWide = rules.find((r) => !r.provinceCode);
    const rule = byProvince ?? countryWide;
    if (!rule) return { perLine: input.lines.map(() => 0), total: 0 };

    const rate = rule.rateBps / 10_000;
    const perLine = input.lines.map((line) => {
      if (!line.taxable || rate === 0) return 0;
      return inclusive
        ? Math.round(line.lineTotal - line.lineTotal / (1 + rate))
        : Math.round(line.lineTotal * rate);
    });
    return { perLine, total: perLine.reduce((sum, t) => sum + t, 0) };
  }
}
