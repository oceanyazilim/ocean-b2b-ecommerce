import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import type { CalculatorContext, CalculatorLine, TaxCalculator } from "../orders/calculators";

// Real Phase 7 implementation: the most specific active rule for the shipping address wins
// (province beats country-only), and — additively, spec section 24 — a rule matching the
// line's tax class wins over a generic (taxClassId = null) rule at the same geography. No
// matching rule => 0 tax on that line. `pricesIncludeTax` decides whether the line total
// already contains the tax (extract) or needs it added on top.
//
// Spec section 25's customer tax-exempt status is wired in here too: a taxable-status short
// circuit (customer or the buying company's location marked tax exempt => 0 tax for the whole
// order) rather than per-product-category enforcement, since that's the only piece of "customer
// tax status" the checkout flow already collects real data for.
@Injectable()
export class TaxCalculatorService implements TaxCalculator {
  constructor(private readonly prisma: PrismaService) {}

  private async buyerIsTaxExempt(input: CalculatorContext): Promise<boolean> {
    const [customer, location] = await Promise.all([
      input.customerId
        ? this.prisma.customer.findUnique({
            where: { id: input.customerId },
            select: { taxExempt: true },
          })
        : null,
      input.companyLocationId
        ? this.prisma.companyLocation.findUnique({
            where: { id: input.companyLocationId },
            select: { taxExempt: true },
          })
        : null,
    ]);
    return !!customer?.taxExempt || !!location?.taxExempt;
  }

  private pickRule<T extends { provinceCode: string | null; taxClassId: string | null }>(
    rules: T[],
    provinceCode: string | null,
    taxClassId: string | null,
  ): T | undefined {
    // Most specific first: province + class, province only, country + class, country only.
    return (
      rules.find((r) => r.provinceCode === provinceCode && r.taxClassId === taxClassId) ??
      (taxClassId ? rules.find((r) => r.provinceCode === provinceCode && !r.taxClassId) : undefined) ??
      rules.find((r) => !r.provinceCode && r.taxClassId === taxClassId) ??
      (taxClassId ? rules.find((r) => !r.provinceCode && !r.taxClassId) : undefined)
    );
  }

  async taxes(input: CalculatorContext): Promise<{ perLine: number[]; total: number }> {
    const address = input.shippingAddress ?? input.billingAddress;
    if (!address) return { perLine: input.lines.map(() => 0), total: 0 };

    if (await this.buyerIsTaxExempt(input)) {
      return { perLine: input.lines.map(() => 0), total: 0 };
    }

    const store = await this.prisma.store.findUnique({
      where: { id: input.storeId },
      select: { pricesIncludeTax: true },
    });
    const inclusive = store?.pricesIncludeTax ?? false;

    const rules = await this.prisma.taxRule.findMany({
      where: { storeId: input.storeId, isActive: true, countryCode: address.countryCode },
    });
    if (rules.length === 0) return { perLine: input.lines.map(() => 0), total: 0 };

    const provinceCode = address.provinceCode ?? null;
    const perLine = input.lines.map((line: CalculatorLine) => {
      if (!line.taxable) return 0;
      const rule = this.pickRule(rules, provinceCode, line.taxClassId);
      if (!rule) return 0;
      const rate = rule.rateBps / 10_000;
      if (rate === 0) return 0;
      return inclusive
        ? Math.round(line.lineTotal - line.lineTotal / (1 + rate))
        : Math.round(line.lineTotal * rate);
    });
    return { perLine, total: perLine.reduce((sum, t) => sum + t, 0) };
  }
}
