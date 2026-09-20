import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@ocean/db";
import type {
  TaxClassInput,
  TaxClassSummary,
  TaxMarketWarning,
  TaxProviderInfo,
  TaxRegistrationCountryGroup,
  TaxRegistrationInput,
  TaxRegistrationSummary,
  TaxRuleInput,
  TaxRuleSummary,
  TaxTerminology,
  UpdateTaxClassInput,
  UpdateTaxRegistrationInput,
  UpdateTaxRuleInput,
} from "@ocean/types";

import { ConflictError, NotFoundError, ValidationError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CountryProfilesService } from "../countries/countries.service";
import { EventsService } from "../events/events.service";
import { TAX_PROVIDER, type TaxProvider } from "./tax-provider";

type RuleRow = Prisma.TaxRuleGetPayload<{ include: { taxClass: { select: { name: true } } } }>;
type RegistrationRow = Prisma.TaxRegistrationGetPayload<Record<string, never>>;
type TaxClassRow = Prisma.TaxClassGetPayload<{ include: { _count: { select: { products: true } } } }>;

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";

// Seeded once per store, the first time its tax-class list is read (rather than in the global
// seed script), so a store that already existed before this feature shipped gets these without
// needing a database reset. Codes/order per spec section 24.
const DEFAULT_TAX_CLASSES: Array<{ code: string; name: string; description: string; isDefault?: boolean }> = [
  { code: "standard", name: "Standard goods", description: "The default rate for ordinary physical goods.", isDefault: true },
  { code: "digital_services", name: "Digital services", description: "Downloads, SaaS and other digital services." },
  { code: "food", name: "Food", description: "Groceries and food products." },
  { code: "books", name: "Books", description: "Printed and digital books." },
  { code: "clothing", name: "Clothing", description: "Apparel and footwear." },
  { code: "medical", name: "Medical products", description: "Medical devices and pharmaceuticals." },
  { code: "exempt", name: "Tax exempt", description: "Never taxed, regardless of jurisdiction." },
];

@Injectable()
export class TaxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
    private readonly countries: CountryProfilesService,
    @Inject(TAX_PROVIDER) private readonly taxProvider: TaxProvider,
  ) {}

  private scope(ctx: TenantContext): Prisma.TaxRuleWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId };
  }

  private toSummary(row: RuleRow): TaxRuleSummary {
    return {
      id: row.id,
      name: row.name,
      countryCode: row.countryCode,
      provinceCode: row.provinceCode,
      taxClassId: row.taxClassId,
      taxClassName: row.taxClass?.name ?? null,
      ratePercent: row.rateBps / 100,
      isActive: row.isActive,
      position: row.position,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async list(ctx: TenantContext): Promise<TaxRuleSummary[]> {
    const rows = await this.prisma.taxRule.findMany({
      where: this.scope(ctx),
      include: { taxClass: { select: { name: true } } },
      orderBy: [{ countryCode: "asc" }, { position: "asc" }],
    });
    return rows.map((r) => this.toSummary(r));
  }

  private async assertTaxClass(ctx: TenantContext, taxClassId: string | null | undefined) {
    if (!taxClassId) return;
    const row = await this.prisma.taxClass.findFirst({
      where: { id: taxClassId, storeId: ctx.storeId as string },
      select: { id: true },
    });
    if (!row) {
      throw new ValidationError("Tax class not found in this store.", [
        { path: "taxClassId", message: "Unknown tax class" },
      ]);
    }
  }

  async create(ctx: TenantContext, input: TaxRuleInput, meta: RequestMeta): Promise<TaxRuleSummary> {
    await this.assertTaxClass(ctx, input.taxClassId ?? null);
    const created = await this.prisma.taxRule
      .create({
        data: {
          storeId: ctx.storeId as string,
          organizationId: ctx.organizationId,
          name: input.name,
          countryCode: input.countryCode,
          provinceCode: input.provinceCode ?? null,
          taxClassId: input.taxClassId ?? null,
          rateBps: input.rateBps,
          isActive: input.isActive,
          position: input.position,
        },
        include: { taxClass: { select: { name: true } } },
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) throw new ConflictError("This rule already exists.");
        throw error;
      });
    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "tax.rule_created",
        resourceType: "tax_rule",
        resourceId: created.id,
        after: { countryCode: created.countryCode, provinceCode: created.provinceCode },
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "tax.rule.created", { ruleId: created.id });
    return this.toSummary(created);
  }

  async update(
    ctx: TenantContext,
    id: string,
    input: UpdateTaxRuleInput,
    meta: RequestMeta,
  ): Promise<TaxRuleSummary> {
    const current = await this.prisma.taxRule.findFirst({ where: { ...this.scope(ctx), id } });
    if (!current) throw new NotFoundError("Tax rule");
    if (input.taxClassId !== undefined) await this.assertTaxClass(ctx, input.taxClassId);
    const data: Prisma.TaxRuleUncheckedUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.countryCode !== undefined) data.countryCode = input.countryCode;
    if (input.provinceCode !== undefined) data.provinceCode = input.provinceCode;
    if (input.taxClassId !== undefined) data.taxClassId = input.taxClassId;
    if (input.rateBps !== undefined) data.rateBps = input.rateBps;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.position !== undefined) data.position = input.position;
    const updated = await this.prisma.taxRule.update({
      where: { id },
      data,
      include: { taxClass: { select: { name: true } } },
    });
    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "tax.rule_updated",
        resourceType: "tax_rule",
        resourceId: id,
        before: { rateBps: current.rateBps },
        after: input,
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "tax.rule.updated", { ruleId: id });
    return this.toSummary(updated);
  }

  async remove(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    const current = await this.prisma.taxRule.findFirst({ where: { ...this.scope(ctx), id } });
    if (!current) throw new NotFoundError("Tax rule");
    await this.prisma.taxRule.delete({ where: { id } });
    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "tax.rule_deleted",
        resourceType: "tax_rule",
        resourceId: id,
        before: { name: current.name },
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "tax.rule.deleted", { ruleId: id });
  }

  async getSettings(ctx: TenantContext): Promise<{ pricesIncludeTax: boolean }> {
    const store = await this.prisma.store.findUniqueOrThrow({
      where: { id: ctx.storeId as string },
      select: { pricesIncludeTax: true },
    });
    return { pricesIncludeTax: store.pricesIncludeTax };
  }

  async updateSettings(ctx: TenantContext, pricesIncludeTax: boolean, meta: RequestMeta) {
    await this.prisma.store.update({
      where: { id: ctx.storeId as string },
      data: { pricesIncludeTax },
    });
    await this.audit.record({
      organizationId: ctx.organizationId,
      storeId: ctx.storeId,
      actorId: ctx.actor.id,
      action: "tax.settings_updated",
      resourceType: "store",
      resourceId: ctx.storeId as string,
      after: { pricesIncludeTax },
      meta,
    });
    return { pricesIncludeTax };
  }

  // -----------------------------------------------------------------------
  // Tax registrations (spec section 21)
  // -----------------------------------------------------------------------

  private async terminologyFor(countryCode: string) {
    const profile = await this.countries.getCountryProfile(countryCode);
    return {
      countryName: profile?.name ?? null,
      taxTerminology: (profile?.taxTerminology as TaxTerminology | undefined) ?? null,
    };
  }

  private terminologyFrom(profile: { name: string; taxTerminology: unknown } | undefined) {
    return {
      countryName: profile?.name ?? null,
      taxTerminology: (profile?.taxTerminology as TaxTerminology | undefined) ?? null,
    };
  }

  private toRegistrationSummary(
    row: RegistrationRow,
    resolved: { countryName: string | null; taxTerminology: TaxTerminology | null },
  ): TaxRegistrationSummary {
    return {
      id: row.id,
      countryCode: row.countryCode,
      countryName: resolved.countryName,
      taxTerminology: resolved.taxTerminology,
      regionCode: row.regionCode,
      registrationType: row.registrationType,
      registrationNumber: row.registrationNumber,
      status: row.status,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // Grouped by country (spec section 21's "United States / Sales tax / 3 registrations"), each
  // carrying the real local tax terminology from CountryProfile so the UI never hardcodes "VAT".
  async listRegistrations(ctx: TenantContext): Promise<TaxRegistrationCountryGroup[]> {
    const rows = await this.prisma.taxRegistration.findMany({
      where: { storeId: ctx.storeId as string, organizationId: ctx.organizationId },
      orderBy: [{ countryCode: "asc" }, { createdAt: "asc" }],
    });
    const codes = [...new Set(rows.map((r) => r.countryCode))];
    const profiles = await this.countries.getCountryProfiles(codes);
    const profileByCode = new Map(profiles.map((p) => [p.countryCode, p]));
    const resolved = new Map(
      codes.map((code) => [code, this.terminologyFrom(profileByCode.get(code.toUpperCase()))] as const),
    );
    const groups = new Map<string, TaxRegistrationCountryGroup>();
    for (const row of rows) {
      const info = resolved.get(row.countryCode)!;
      const summary = this.toRegistrationSummary(row, info);
      const existing = groups.get(row.countryCode);
      if (existing) {
        existing.registrations.push(summary);
        if (summary.status === "active") existing.activeCount += 1;
      } else {
        groups.set(row.countryCode, {
          countryCode: row.countryCode,
          countryName: info.countryName,
          taxTerminology: info.taxTerminology,
          registrations: [summary],
          activeCount: summary.status === "active" ? 1 : 0,
        });
      }
    }
    return [...groups.values()];
  }

  async createRegistration(
    ctx: TenantContext,
    input: TaxRegistrationInput,
    meta: RequestMeta,
  ): Promise<TaxRegistrationSummary> {
    const created = await this.prisma.taxRegistration.create({
      data: {
        storeId: ctx.storeId as string,
        organizationId: ctx.organizationId,
        countryCode: input.countryCode,
        regionCode: input.regionCode ?? null,
        registrationType: input.registrationType,
        registrationNumber: input.registrationNumber ?? null,
        status: input.status,
        notes: input.notes ?? null,
      },
    });
    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "tax.registration_created",
        resourceType: "tax_registration",
        resourceId: created.id,
        after: { countryCode: created.countryCode, status: created.status },
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "tax.registration.created", { registrationId: created.id });
    return this.toRegistrationSummary(created, await this.terminologyFor(created.countryCode));
  }

  async updateRegistration(
    ctx: TenantContext,
    id: string,
    input: UpdateTaxRegistrationInput,
    meta: RequestMeta,
  ): Promise<TaxRegistrationSummary> {
    const current = await this.prisma.taxRegistration.findFirst({
      where: { id, storeId: ctx.storeId as string, organizationId: ctx.organizationId },
    });
    if (!current) throw new NotFoundError("Tax registration");
    const data: Prisma.TaxRegistrationUncheckedUpdateInput = {};
    if (input.countryCode !== undefined) data.countryCode = input.countryCode;
    if (input.regionCode !== undefined) data.regionCode = input.regionCode;
    if (input.registrationType !== undefined) data.registrationType = input.registrationType;
    if (input.registrationNumber !== undefined) data.registrationNumber = input.registrationNumber;
    if (input.status !== undefined) data.status = input.status;
    if (input.notes !== undefined) data.notes = input.notes;
    const updated = await this.prisma.taxRegistration.update({ where: { id }, data });
    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "tax.registration_updated",
        resourceType: "tax_registration",
        resourceId: id,
        before: { status: current.status },
        after: input,
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "tax.registration.updated", { registrationId: id });
    return this.toRegistrationSummary(updated, await this.terminologyFor(updated.countryCode));
  }

  async removeRegistration(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    const current = await this.prisma.taxRegistration.findFirst({
      where: { id, storeId: ctx.storeId as string, organizationId: ctx.organizationId },
    });
    if (!current) throw new NotFoundError("Tax registration");
    await this.prisma.taxRegistration.delete({ where: { id } });
    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "tax.registration_deleted",
        resourceType: "tax_registration",
        resourceId: id,
        before: { countryCode: current.countryCode },
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "tax.registration.deleted", { registrationId: id });
  }

  // -----------------------------------------------------------------------
  // Tax classes (spec section 24)
  // -----------------------------------------------------------------------

  private toTaxClassSummary(row: TaxClassRow): TaxClassSummary {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      isDefault: row.isDefault,
      isSystem: row.isSystem,
      position: row.position,
      productCount: row._count.products,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // Seeds the default classes on first read for stores created before this feature shipped —
  // see DEFAULT_TAX_CLASSES. A store that already has any tax class (including a merchant's own
  // custom ones) is left untouched.
  private async ensureDefaultTaxClasses(ctx: TenantContext) {
    const count = await this.prisma.taxClass.count({ where: { storeId: ctx.storeId as string } });
    if (count > 0) return;
    await this.prisma.taxClass.createMany({
      data: DEFAULT_TAX_CLASSES.map((c, position) => ({
        storeId: ctx.storeId as string,
        organizationId: ctx.organizationId,
        code: c.code,
        name: c.name,
        description: c.description,
        isDefault: c.isDefault ?? false,
        isSystem: true,
        position,
      })),
    });
  }

  async listTaxClasses(ctx: TenantContext): Promise<TaxClassSummary[]> {
    await this.ensureDefaultTaxClasses(ctx);
    const rows = await this.prisma.taxClass.findMany({
      where: { storeId: ctx.storeId as string },
      include: { _count: { select: { products: true } } },
      orderBy: [{ position: "asc" }, { name: "asc" }],
    });
    return rows.map((r) => this.toTaxClassSummary(r));
  }

  async createTaxClass(
    ctx: TenantContext,
    input: TaxClassInput,
    meta: RequestMeta,
  ): Promise<TaxClassSummary> {
    await this.ensureDefaultTaxClasses(ctx);
    const created = await this.prisma.taxClass
      .create({
        data: {
          storeId: ctx.storeId as string,
          organizationId: ctx.organizationId,
          code: input.code,
          name: input.name,
          description: input.description ?? null,
          isDefault: input.isDefault,
          position: input.position,
        },
        include: { _count: { select: { products: true } } },
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError("A tax class with this code already exists.", [
            { path: "code", message: "Already used" },
          ]);
        }
        throw error;
      });
    if (created.isDefault) await this.clearOtherDefaults(ctx, created.id);
    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "tax.class_created",
        resourceType: "tax_class",
        resourceId: created.id,
        after: { code: created.code, name: created.name },
        meta,
      },
      this.prisma,
    );
    return this.toTaxClassSummary(created);
  }

  async updateTaxClass(
    ctx: TenantContext,
    id: string,
    input: UpdateTaxClassInput,
    meta: RequestMeta,
  ): Promise<TaxClassSummary> {
    const current = await this.prisma.taxClass.findFirst({
      where: { id, storeId: ctx.storeId as string },
    });
    if (!current) throw new NotFoundError("Tax class");
    const data: Prisma.TaxClassUncheckedUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.isDefault !== undefined) data.isDefault = input.isDefault;
    if (input.position !== undefined) data.position = input.position;
    const updated = await this.prisma.taxClass.update({
      where: { id },
      data,
      include: { _count: { select: { products: true } } },
    });
    if (input.isDefault) await this.clearOtherDefaults(ctx, id);
    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "tax.class_updated",
        resourceType: "tax_class",
        resourceId: id,
        after: input,
        meta,
      },
      this.prisma,
    );
    return this.toTaxClassSummary(updated);
  }

  private async clearOtherDefaults(ctx: TenantContext, keepId: string) {
    await this.prisma.taxClass.updateMany({
      where: { storeId: ctx.storeId as string, id: { not: keepId }, isDefault: true },
      data: { isDefault: false },
    });
  }

  async removeTaxClass(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    const current = await this.prisma.taxClass.findFirst({
      where: { id, storeId: ctx.storeId as string },
      include: { _count: { select: { products: true } } },
    });
    if (!current) throw new NotFoundError("Tax class");
    if (current.isSystem) {
      throw new ValidationError("Built-in tax classes can't be deleted.", [
        { path: "id", message: "Built-in" },
      ]);
    }
    if (current._count.products > 0) {
      throw new ConflictError("Reassign the products using this tax class first.");
    }
    await this.prisma.taxClass.delete({ where: { id } });
    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "tax.class_deleted",
        resourceType: "tax_class",
        resourceId: id,
        before: { code: current.code },
        meta,
      },
      this.prisma,
    );
  }

  // -----------------------------------------------------------------------
  // TaxProvider abstraction (spec section 50) & platform warnings (spec section 52)
  // -----------------------------------------------------------------------

  // Lets the admin UI honestly label rates as "Manually configured" (spec section 51) instead of
  // assuming — the moment a second, real automatic provider is registered, this flips without any
  // UI change.
  getProviderInfo(): TaxProviderInfo {
    return {
      id: this.taxProvider.id,
      name: this.taxProvider.name,
      isAutomatic: this.taxProvider.isAutomatic,
    };
  }

  // Spec section 52: "If the merchant enters a market without configured taxation... Do NOT
  // silently assume zero tax." A market the merchant is "selling into" is real orders (any
  // non-cancelled order whose shipping — or, absent that, billing — address resolves to that
  // country) unioned with active Markets targeting that country. "Configured" means an active
  // TaxRule or an active TaxRegistration exists for that country in this store — either is
  // enough, since a registration without a rate is still a deliberate compliance decision (e.g.
  // "registered, 0% category"), while a rule without a registration is still a real, working rate.
  async getMarketWarnings(ctx: TenantContext): Promise<TaxMarketWarning[]> {
    const storeId = ctx.storeId as string;
    const organizationId = ctx.organizationId;

    const [orderCountryRows, activeMarkets, activeRules, activeRegistrations] = await Promise.all([
      this.prisma.$queryRaw<{ country_code: string | null }[]>(Prisma.sql`
        SELECT DISTINCT COALESCE(shipping_address->>'countryCode', billing_address->>'countryCode') AS country_code
        FROM orders
        WHERE store_id = ${storeId}::uuid AND organization_id = ${organizationId}::uuid
          AND status <> 'cancelled'
          AND (shipping_address IS NOT NULL OR billing_address IS NOT NULL)
      `),
      this.prisma.market.findMany({
        where: { storeId, organizationId, isActive: true },
        select: { countryCode: true },
      }),
      this.prisma.taxRule.findMany({
        where: { storeId, organizationId, isActive: true },
        select: { countryCode: true },
      }),
      this.prisma.taxRegistration.findMany({
        where: { storeId, organizationId, status: "active" },
        select: { countryCode: true },
      }),
    ]);

    const sellingCountries = new Map<string, "orders" | "market" | "both">();
    for (const row of orderCountryRows) {
      if (row.country_code) sellingCountries.set(row.country_code.toUpperCase(), "orders");
    }
    for (const market of activeMarkets) {
      const code = market.countryCode.toUpperCase();
      const existing = sellingCountries.get(code);
      sellingCountries.set(code, existing === "orders" ? "both" : "market");
    }

    const configured = new Set<string>([
      ...activeRules.map((r) => r.countryCode.toUpperCase()),
      ...activeRegistrations.map((r) => r.countryCode.toUpperCase()),
    ]);

    const missing = [...sellingCountries.entries()].filter(([code]) => !configured.has(code));
    const missingProfiles = await this.countries.getCountryProfiles(missing.map(([code]) => code));
    const missingProfileByCode = new Map(missingProfiles.map((p) => [p.countryCode, p]));
    const warnings = missing.map(([countryCode, source]) => {
      const profile = missingProfileByCode.get(countryCode.toUpperCase());
      return { countryCode, countryName: profile?.name ?? countryCode, source } satisfies TaxMarketWarning;
    });
    return warnings.sort((a, b) => a.countryName.localeCompare(b.countryName));
  }
}
