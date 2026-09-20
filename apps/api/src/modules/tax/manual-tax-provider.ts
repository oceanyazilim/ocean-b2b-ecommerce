import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import type { CalculatorContext, CalculatorLine } from "../orders/calculators";
import { CountryProfilesService } from "../countries/countries.service";
import type {
  ProductTaxCategory,
  TaxIdValidationResult,
  TaxProvider,
  TaxRateLookup,
  TaxRegistrationLookup,
} from "./tax-provider";

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
//
// This class is the one, genuinely-working TaxProvider (spec section 50) — behavior is byte-for-
// byte the same calculation that used to live directly in TaxCalculatorService; only the seam
// moved, nothing about how a rate is picked or applied changed.
@Injectable()
export class ManualTaxProvider implements TaxProvider {
  readonly id = "manual";
  readonly name = "Manual tax rules";
  readonly isAutomatic = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly countries: CountryProfilesService,
  ) {}

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

  async calculateTax(input: CalculatorContext): Promise<{ perLine: number[]; total: number }> {
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

  // Real, working validation against CountryProfile.taxIdFormats' regex (spec section 50's
  // validateTaxID) — the same source of truth already used to resolve tax-id *labels* elsewhere
  // (companies.service.ts), now also used to actually check the format.
  async validateTaxID(
    countryCode: string,
    taxId: string,
    taxIdType?: string | null,
  ): Promise<TaxIdValidationResult> {
    const profile = await this.countries.getCountryProfile(countryCode);
    const formats = profile?.taxIdFormats ?? [];
    if (formats.length === 0) return { valid: true, formatLabel: null };
    const match = taxIdType ? formats.find((f) => f.code === taxIdType) : undefined;
    const format = match ?? formats[0];
    if (!format) return { valid: true, formatLabel: null };
    const trimmed = taxId.trim();
    if (!format.regex) return { valid: trimmed.length > 0, formatLabel: format.label };
    // format.regex is admin-configured, unvalidated data (Platform Admin Countries screen) — the
    // same class of input business-profile-validation.ts and metafields/validation.ts already
    // guard with a try/catch'd RegExp construction. A malformed pattern here must fail this one
    // tax-ID check gracefully, not throw a SyntaxError into an unhandled 500 for the whole request.
    const regex = safeRegex(format.regex);
    if (!regex) return { valid: false, formatLabel: format.label };
    return { valid: regex.test(trimmed), formatLabel: format.label };
  }

  // The same most-specific-rule lookup the real calculator uses, exposed standalone (spec
  // section 50's getTaxRate) so the admin UI (or a future preview tool) can ask "what rate would
  // apply here" without pricing a whole cart.
  async getTaxRate(
    storeId: string,
    countryCode: string,
    provinceCode: string | null,
    taxClassId: string | null,
  ): Promise<TaxRateLookup | null> {
    const rules = await this.prisma.taxRule.findMany({
      where: { storeId, isActive: true, countryCode: countryCode.toUpperCase() },
    });
    const rule = this.pickRule(rules, provinceCode, taxClassId);
    if (!rule) return null;
    return { rateBps: rule.rateBps, ruleId: rule.id, ruleName: rule.name };
  }

  async getProductTaxCategory(storeId: string, productId: string): Promise<ProductTaxCategory | null> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, storeId },
      select: { taxClass: { select: { id: true, code: true, name: true } } },
    });
    if (!product?.taxClass) return null;
    return { taxClassId: product.taxClass.id, code: product.taxClass.code, name: product.taxClass.name };
  }

  // Real TaxRegistration rows (spec section 21) — the merchant's own declared registrations,
  // exposed through the provider interface (spec section 50's getTaxRegistrations) rather than
  // read directly, so a future automatic provider could instead report registrations it manages
  // on the merchant's behalf.
  async getTaxRegistrations(storeId: string, organizationId: string): Promise<TaxRegistrationLookup[]> {
    const rows = await this.prisma.taxRegistration.findMany({
      where: { storeId, organizationId },
      select: { countryCode: true, regionCode: true, registrationType: true, status: true },
      orderBy: [{ countryCode: "asc" }],
    });
    return rows;
  }
}

// Same safe-construction pattern used elsewhere for admin-configured regex strings (see
// organizations/business-profile-validation.ts and catalog/metafields/validation.ts): a
// malformed pattern returns null instead of throwing a SyntaxError.
function safeRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}
