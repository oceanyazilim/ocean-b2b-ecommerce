import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type { TaxRuleInput, TaxRuleSummary, UpdateTaxRuleInput } from "@ocean/types";

import { ConflictError, NotFoundError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { EventsService } from "../events/events.service";

type RuleRow = Prisma.TaxRuleGetPayload<Record<string, never>>;

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";

@Injectable()
export class TaxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
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
      orderBy: [{ countryCode: "asc" }, { position: "asc" }],
    });
    return rows.map((r) => this.toSummary(r));
  }

  async create(ctx: TenantContext, input: TaxRuleInput, meta: RequestMeta): Promise<TaxRuleSummary> {
    const created = await this.prisma.taxRule
      .create({
        data: {
          storeId: ctx.storeId as string,
          organizationId: ctx.organizationId,
          name: input.name,
          countryCode: input.countryCode,
          provinceCode: input.provinceCode ?? null,
          rateBps: input.rateBps,
          isActive: input.isActive,
          position: input.position,
        },
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
    const data: Prisma.TaxRuleUncheckedUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.countryCode !== undefined) data.countryCode = input.countryCode;
    if (input.provinceCode !== undefined) data.provinceCode = input.provinceCode;
    if (input.rateBps !== undefined) data.rateBps = input.rateBps;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.position !== undefined) data.position = input.position;
    const updated = await this.prisma.taxRule.update({ where: { id }, data });
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
}
