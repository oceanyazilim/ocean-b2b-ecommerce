import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type { MarketInput, MarketSummary, UpdateMarketInput } from "@ocean/types";

import { ConflictError, NotFoundError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { EventsService } from "../events/events.service";

type MarketRow = Prisma.MarketGetPayload<Record<string, never>>;

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";

@Injectable()
export class MarketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  private scope(ctx: TenantContext): Prisma.MarketWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId };
  }

  private toSummary(row: MarketRow): MarketSummary {
    return {
      id: row.id,
      name: row.name,
      currency: row.currency,
      locale: row.locale,
      countryCode: row.countryCode,
      isDefault: row.isDefault,
      isActive: row.isActive,
      defaultLanguage: row.defaultLanguage,
      additionalLanguages: row.additionalLanguages,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async list(ctx: TenantContext): Promise<MarketSummary[]> {
    const rows = await this.prisma.market.findMany({
      where: this.scope(ctx),
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => this.toSummary(r));
  }

  async get(ctx: TenantContext, id: string): Promise<MarketSummary> {
    const row = await this.prisma.market.findFirst({
      where: { ...this.scope(ctx), id },
    });
    if (!row) throw new NotFoundError("Market");
    return this.toSummary(row);
  }

  async create(ctx: TenantContext, input: MarketInput, meta: RequestMeta): Promise<MarketSummary> {
    const created = await this.prisma.market
      .create({
        data: {
          storeId: ctx.storeId as string,
          organizationId: ctx.organizationId,
          name: input.name,
          currency: input.currency,
          locale: input.locale,
          countryCode: input.countryCode,
          isDefault: input.isDefault,
          isActive: input.isActive,
          defaultLanguage: input.defaultLanguage ?? null,
          additionalLanguages: input.additionalLanguages ?? [],
        },
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) throw new ConflictError("A default market already exists.");
        throw error;
      });

    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "market.created",
        resourceType: "market",
        resourceId: created.id,
        after: { name: created.name, currency: created.currency, locale: created.locale },
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "market.created", { marketId: created.id });
    return this.toSummary(created);
  }

  async update(
    ctx: TenantContext,
    id: string,
    input: UpdateMarketInput,
    meta: RequestMeta,
  ): Promise<MarketSummary> {
    const current = await this.prisma.market.findFirst({ where: { ...this.scope(ctx), id } });
    if (!current) throw new NotFoundError("Market");

    const data: Prisma.MarketUncheckedUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.currency !== undefined) data.currency = input.currency;
    if (input.locale !== undefined) data.locale = input.locale;
    if (input.countryCode !== undefined) data.countryCode = input.countryCode;
    if (input.isDefault !== undefined) data.isDefault = input.isDefault;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.defaultLanguage !== undefined) data.defaultLanguage = input.defaultLanguage;
    if (input.additionalLanguages !== undefined) data.additionalLanguages = input.additionalLanguages;

    const updated = await this.prisma.market.update({ where: { id }, data });
    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "market.updated",
        resourceType: "market",
        resourceId: id,
        before: { name: current.name, currency: current.currency },
        after: input,
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "market.updated", { marketId: id });
    return this.toSummary(updated);
  }

  async remove(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    const current = await this.prisma.market.findFirst({ where: { ...this.scope(ctx), id } });
    if (!current) throw new NotFoundError("Market");
    
    if (current.isDefault) {
      throw new ConflictError("Cannot delete the default market.");
    }

    await this.prisma.market.delete({ where: { id } });
    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "market.deleted",
        resourceType: "market",
        resourceId: id,
        before: { name: current.name },
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "market.deleted", { marketId: id });
  }
}
