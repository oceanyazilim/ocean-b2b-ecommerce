import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type {
  ContractPriceListQuery,
  ContractPriceSummary,
  CreateVolumeRuleInput,
  Paginated,
  PricingScope,
  QuantityRuleScope,
  QuantityRuleSummary,
  UpdateVolumeRuleInput,
  UpsertContractPriceInput,
  UpsertQuantityRuleInput,
  VolumeRuleSummary,
  VolumeTier,
  VolumeTierType,
} from "@ocean/types";

import { NotFoundError, ValidationError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { toMoney } from "../catalog/money";
import { EventsService } from "../events/events.service";
import { resolveScopeLabels, scopeLabel } from "./scope-labels";

const contractInclude = {
  company: { select: { id: true, displayName: true } },
  location: { select: { id: true, name: true } },
  variant: {
    select: {
      id: true,
      title: true,
      sku: true,
      price: true,
      product: { select: { id: true, title: true } },
    },
  },
} satisfies Prisma.ContractPriceInclude;
type ContractRow = Prisma.ContractPriceGetPayload<{ include: typeof contractInclude }>;

// Volume tiers, quantity rules and contract prices: small CRUD surfaces that share the
// scope-validation and labelling helpers, so they live in one service.
@Injectable()
export class PricingRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  private store(ctx: TenantContext) {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId };
  }

  private async currency(ctx: TenantContext): Promise<string> {
    const store = await this.prisma.store.findUnique({
      where: { id: ctx.storeId as string },
      select: { defaultCurrency: true },
    });
    return store?.defaultCurrency ?? "TRY";
  }

  // ---- volume rules -----------------------------------------------------------------------------

  async listVolumeRules(ctx: TenantContext): Promise<VolumeRuleSummary[]> {
    const rows = await this.prisma.volumePricingRule.findMany({
      where: this.store(ctx),
      include: { priceList: { select: { id: true, name: true } } },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    });
    const labels = await resolveScopeLabels(this.prisma, ctx.storeId as string, rows);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      scope: r.scope as PricingScope,
      scopeId: r.scopeId,
      scopeLabel: scopeLabel(labels, r.scope, r.scopeId),
      priceList: r.priceList,
      tierType: r.tierType as VolumeTierType,
      tiers: r.tiers as unknown as VolumeTier[],
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async createVolumeRule(ctx: TenantContext, input: CreateVolumeRuleInput, meta: RequestMeta) {
    const id = await this.prisma.$transaction(async (tx) => {
      await this.assertScope(ctx, input.scope, input.scopeId ?? null, tx);
      if (input.priceListId) await this.assertPriceList(ctx, input.priceListId, tx);
      const created = await tx.volumePricingRule.create({
        data: {
          ...this.store(ctx),
          name: input.name,
          scope: input.scope,
          scopeId: input.scopeId ?? null,
          priceListId: input.priceListId ?? null,
          tierType: input.tierType,
          tiers: input.tiers as unknown as Prisma.InputJsonValue,
          isActive: input.isActive,
        },
      });
      await this.audit.record(
        {
          ...this.actor(ctx, meta),
          action: "volume_rule.created",
          resourceType: "volume_rule",
          resourceId: created.id,
          after: { name: input.name, scope: input.scope, tiers: input.tiers },
        },
        tx,
      );
      await this.events.publish(ctx, "pricing.volume_rule.created", { ruleId: created.id }, tx);
      return created.id;
    });
    return (await this.listVolumeRules(ctx)).find((r) => r.id === id)!;
  }

  async updateVolumeRule(
    ctx: TenantContext,
    id: string,
    input: UpdateVolumeRuleInput,
    meta: RequestMeta,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.volumePricingRule.findFirst({ where: { ...this.store(ctx), id } });
      if (!current) throw new NotFoundError("Volume pricing rule");
      if (input.priceListId) await this.assertPriceList(ctx, input.priceListId, tx);
      const data: Prisma.VolumePricingRuleUncheckedUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.priceListId !== undefined) data.priceListId = input.priceListId;
      if (input.tierType !== undefined) data.tierType = input.tierType;
      if (input.tiers !== undefined) data.tiers = input.tiers as unknown as Prisma.InputJsonValue;
      if (input.isActive !== undefined) data.isActive = input.isActive;
      if (
        input.tiers !== undefined &&
        input.tierType === undefined &&
        current.tierType === "percent_off"
      ) {
        if (!input.tiers.every((t) => t.value >= 1 && t.value <= 10_000)) {
          throw new ValidationError("Percent-off tiers must be between 1 and 10000 basis points.", [
            { path: "tiers", message: "Out of range" },
          ]);
        }
      }
      await tx.volumePricingRule.update({ where: { id }, data });
      await this.audit.record(
        {
          ...this.actor(ctx, meta),
          action: "volume_rule.updated",
          resourceType: "volume_rule",
          resourceId: id,
          before: { name: current.name, tiers: current.tiers, isActive: current.isActive },
          after: {
            name: input.name ?? current.name,
            tiers: input.tiers ?? current.tiers,
            isActive: input.isActive ?? current.isActive,
          },
        },
        tx,
      );
      await this.events.publish(ctx, "pricing.volume_rule.updated", { ruleId: id }, tx);
    });
    return (await this.listVolumeRules(ctx)).find((r) => r.id === id)!;
  }

  async removeVolumeRule(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.volumePricingRule.findFirst({ where: { ...this.store(ctx), id } });
      if (!current) throw new NotFoundError("Volume pricing rule");
      await tx.volumePricingRule.delete({ where: { id } });
      await this.audit.record(
        {
          ...this.actor(ctx, meta),
          action: "volume_rule.deleted",
          resourceType: "volume_rule",
          resourceId: id,
          before: { name: current.name },
        },
        tx,
      );
      await this.events.publish(ctx, "pricing.volume_rule.deleted", { ruleId: id }, tx);
    });
  }

  // ---- quantity rules ---------------------------------------------------------------------------

  async listQuantityRules(ctx: TenantContext): Promise<QuantityRuleSummary[]> {
    const rows = await this.prisma.quantityRule.findMany({
      where: this.store(ctx),
      orderBy: [{ createdAt: "desc" }],
    });
    const labels = await resolveScopeLabels(this.prisma, ctx.storeId as string, rows);
    return rows.map((r) => ({
      id: r.id,
      scope: r.scope as QuantityRuleScope,
      scopeId: r.scopeId,
      scopeLabel: scopeLabel(labels, r.scope, r.scopeId),
      minQuantity: r.minQuantity,
      maxQuantity: r.maxQuantity,
      increment: r.increment,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async upsertQuantityRule(ctx: TenantContext, input: UpsertQuantityRuleInput, meta: RequestMeta) {
    const id = await this.prisma.$transaction(async (tx) => {
      await this.assertScope(ctx, input.scope, input.scopeId, tx);
      const data = {
        minQuantity: input.minQuantity ?? null,
        maxQuantity: input.maxQuantity ?? null,
        increment: input.increment ?? null,
      };
      const row = await tx.quantityRule.upsert({
        where: {
          storeId_scope_scopeId: {
            storeId: ctx.storeId as string,
            scope: input.scope,
            scopeId: input.scopeId,
          },
        },
        create: { ...this.store(ctx), scope: input.scope, scopeId: input.scopeId, ...data },
        update: data,
      });
      await this.audit.record(
        {
          ...this.actor(ctx, meta),
          action: "quantity_rule.set",
          resourceType: "quantity_rule",
          resourceId: row.id,
          after: { scope: input.scope, scopeId: input.scopeId, ...data },
        },
        tx,
      );
      await this.events.publish(ctx, "pricing.quantity_rule.set", { ruleId: row.id }, tx);
      return row.id;
    });
    return (await this.listQuantityRules(ctx)).find((r) => r.id === id)!;
  }

  async removeQuantityRule(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.quantityRule.findFirst({ where: { ...this.store(ctx), id } });
      if (!current) throw new NotFoundError("Quantity rule");
      await tx.quantityRule.delete({ where: { id } });
      await this.audit.record(
        {
          ...this.actor(ctx, meta),
          action: "quantity_rule.deleted",
          resourceType: "quantity_rule",
          resourceId: id,
          before: { scope: current.scope, scopeId: current.scopeId },
        },
        tx,
      );
      await this.events.publish(ctx, "pricing.quantity_rule.deleted", { ruleId: id }, tx);
    });
  }

  // ---- contract prices --------------------------------------------------------------------------

  private toContract(row: ContractRow, currency: string, now: Date): ContractPriceSummary {
    return {
      id: row.id,
      company: row.company,
      location: row.location,
      variant: {
        id: row.variant.id,
        title: row.variant.title,
        sku: row.variant.sku,
        productId: row.variant.product.id,
        productTitle: row.variant.product.title,
      },
      price: toMoney(row.price, currency),
      basePrice: toMoney(row.variant.price, currency),
      validFrom: row.validFrom?.toISOString() ?? null,
      validTo: row.validTo?.toISOString() ?? null,
      isCurrent: (!row.validFrom || row.validFrom <= now) && (!row.validTo || row.validTo > now),
      note: row.note,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async listContractPrices(
    ctx: TenantContext,
    query: ContractPriceListQuery,
  ): Promise<Paginated<ContractPriceSummary>> {
    const rows = await this.prisma.contractPrice.findMany({
      where: {
        ...this.store(ctx),
        ...(query.companyId ? { companyId: query.companyId } : {}),
        ...(query.variantId ? { variantId: query.variantId } : {}),
        ...(query.q
          ? {
              OR: [
                { company: { displayName: { contains: query.q, mode: "insensitive" } } },
                { variant: { sku: { contains: query.q, mode: "insensitive" } } },
                { variant: { product: { title: { contains: query.q, mode: "insensitive" } } } },
              ],
            }
          : {}),
      },
      include: contractInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    const currency = await this.currency(ctx);
    const now = new Date();
    return {
      data: page.map((r) => this.toContract(r, currency, now)),
      pageInfo: { hasNextPage, endCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null },
    };
  }

  async upsertContractPrice(
    ctx: TenantContext,
    input: UpsertContractPriceInput,
    meta: RequestMeta,
  ): Promise<ContractPriceSummary> {
    const row = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.findFirst({
        where: { id: input.companyId, storeId: ctx.storeId as string, deletedAt: null },
        select: { id: true },
      });
      if (!company) {
        throw new ValidationError("That company is not in this store.", [
          { path: "companyId", message: "Unknown company" },
        ]);
      }
      if (input.companyLocationId) {
        const location = await tx.companyLocation.findFirst({
          where: { id: input.companyLocationId, companyId: company.id },
          select: { id: true },
        });
        if (!location) {
          throw new ValidationError("That location does not belong to the company.", [
            { path: "companyLocationId", message: "Unknown location" },
          ]);
        }
      }
      await this.assertScope(ctx, "variant", input.variantId, tx);
      const existing = await tx.contractPrice.findFirst({
        where: {
          storeId: ctx.storeId as string,
          companyId: company.id,
          companyLocationId: input.companyLocationId ?? null,
          variantId: input.variantId,
        },
      });
      const data = {
        price: BigInt(input.price),
        validFrom: input.validFrom ? new Date(input.validFrom) : null,
        validTo: input.validTo ? new Date(input.validTo) : null,
        note: input.note ?? null,
      };
      const saved = existing
        ? await tx.contractPrice.update({
            where: { id: existing.id },
            data,
            include: contractInclude,
          })
        : await tx.contractPrice.create({
            data: {
              ...this.store(ctx),
              companyId: company.id,
              companyLocationId: input.companyLocationId ?? null,
              variantId: input.variantId,
              ...data,
            },
            include: contractInclude,
          });
      await this.audit.record(
        {
          ...this.actor(ctx, meta),
          action: existing ? "contract_price.updated" : "contract_price.created",
          resourceType: "contract_price",
          resourceId: saved.id,
          before: existing ? { price: Number(existing.price) } : undefined,
          after: { companyId: company.id, variantId: input.variantId, price: input.price },
        },
        tx,
      );
      await this.events.publish(
        ctx,
        "pricing.contract_price.set",
        { contractPriceId: saved.id, companyId: company.id, variantId: input.variantId },
        tx,
      );
      return saved;
    });
    return this.toContract(row, await this.currency(ctx), new Date());
  }

  async removeContractPrice(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.contractPrice.findFirst({ where: { ...this.store(ctx), id } });
      if (!current) throw new NotFoundError("Contract price");
      await tx.contractPrice.delete({ where: { id } });
      await this.audit.record(
        {
          ...this.actor(ctx, meta),
          action: "contract_price.deleted",
          resourceType: "contract_price",
          resourceId: id,
          before: {
            companyId: current.companyId,
            variantId: current.variantId,
            price: Number(current.price),
          },
        },
        tx,
      );
      await this.events.publish(ctx, "pricing.contract_price.deleted", { contractPriceId: id }, tx);
    });
  }

  // ---- internals --------------------------------------------------------------------------------

  private actor(ctx: TenantContext, meta: RequestMeta) {
    return {
      organizationId: ctx.organizationId,
      storeId: ctx.storeId,
      actorId: ctx.actor.id,
      meta,
    };
  }

  private async assertPriceList(ctx: TenantContext, id: string, tx: Prisma.TransactionClient) {
    const row = await tx.priceList.findFirst({
      where: { id, storeId: ctx.storeId as string },
      select: { id: true },
    });
    if (!row) {
      throw new ValidationError("That price list is not in this store.", [
        { path: "priceListId", message: "Unknown price list" },
      ]);
    }
  }

  private async assertScope(
    ctx: TenantContext,
    scope: PricingScope,
    scopeId: string | null,
    tx: Prisma.TransactionClient,
  ) {
    const storeId = ctx.storeId as string;
    if (scope === "store") return;
    if (!scopeId)
      throw new ValidationError("Pick what the rule applies to.", [
        { path: "scopeId", message: "Required" },
      ]);
    const exists =
      scope === "variant"
        ? await tx.productVariant.findFirst({
            where: { id: scopeId, storeId, deletedAt: null },
            select: { id: true },
          })
        : scope === "product"
          ? await tx.product.findFirst({
              where: { id: scopeId, storeId, deletedAt: null },
              select: { id: true },
            })
          : await tx.collection.findFirst({
              where: { id: scopeId, storeId, deletedAt: null },
              select: { id: true },
            });
    if (!exists) {
      throw new ValidationError(`That ${scope} is not in this store.`, [
        { path: "scopeId", message: `Unknown ${scope}` },
      ]);
    }
  }
}
