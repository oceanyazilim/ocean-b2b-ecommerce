import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type {
  ShippingRateInput,
  ShippingRateSummary,
  ShippingZoneDetail,
  ShippingZoneInput,
  ShippingZoneSummary,
  UpdateShippingRateInput,
  UpdateShippingZoneInput,
} from "@ocean/types";

import { ConflictError, NotFoundError, ValidationError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { EventsService } from "../events/events.service";
import { toMoney } from "../catalog/money";

const zoneInclude = { rates: { orderBy: [{ position: "asc" as const }, { price: "asc" as const }] } };
type ZoneRow = Prisma.ShippingZoneGetPayload<{ include: typeof zoneInclude }>;
type RateRow = Prisma.ShippingRateGetPayload<Record<string, never>>;

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";

// Store settings for shipping. Zones group countries; rates inside a zone apply when their
// subtotal/weight conditions hold. The real calculator (calculator.ts) reads the same rows.
@Injectable()
export class ShippingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  private scope(ctx: TenantContext): Prisma.ShippingZoneWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId };
  }

  private toRateSummary(row: RateRow, currency: string): ShippingRateSummary {
    return {
      id: row.id,
      zoneId: row.zoneId,
      name: row.name,
      description: row.description,
      type: row.type,
      price: toMoney(row.price, currency),
      minSubtotal: row.minSubtotal === null ? null : toMoney(row.minSubtotal, currency),
      maxSubtotal: row.maxSubtotal === null ? null : toMoney(row.maxSubtotal, currency),
      minWeightGrams: row.minWeightGrams,
      maxWeightGrams: row.maxWeightGrams,
      isActive: row.isActive,
      position: row.position,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toZoneSummary(row: ZoneRow): ShippingZoneSummary {
    return {
      id: row.id,
      name: row.name,
      countries: row.countries,
      isActive: row.isActive,
      position: row.position,
      rateCount: row.rates.length,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async currency(ctx: TenantContext): Promise<string> {
    const store = await this.prisma.store.findUnique({
      where: { id: ctx.storeId as string },
      select: { defaultCurrency: true },
    });
    return store?.defaultCurrency ?? "TRY";
  }

  // ---- zones ----------------------------------------------------------------------------

  async listZones(ctx: TenantContext): Promise<ShippingZoneSummary[]> {
    const rows = await this.prisma.shippingZone.findMany({
      where: this.scope(ctx),
      include: zoneInclude,
      orderBy: [{ position: "asc" }, { name: "asc" }],
    });
    return rows.map((r) => this.toZoneSummary(r));
  }

  async getZone(ctx: TenantContext, id: string): Promise<ShippingZoneDetail> {
    const row = await this.prisma.shippingZone.findFirst({
      where: { ...this.scope(ctx), id },
      include: zoneInclude,
    });
    if (!row) throw new NotFoundError("Shipping zone");
    const currency = await this.currency(ctx);
    return { ...this.toZoneSummary(row), rates: row.rates.map((r) => this.toRateSummary(r, currency)) };
  }

  async createZone(
    ctx: TenantContext,
    input: ShippingZoneInput,
    meta: RequestMeta,
  ): Promise<ShippingZoneDetail> {
    const created = await this.prisma.shippingZone
      .create({
        data: {
          storeId: ctx.storeId as string,
          organizationId: ctx.organizationId,
          name: input.name,
          countries: input.countries,
          isActive: input.isActive,
          position: input.position,
        },
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) throw new ConflictError("A zone with this name already exists.");
        throw error;
      });
    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "shipping.zone_created",
        resourceType: "shipping_zone",
        resourceId: created.id,
        after: { name: created.name, countries: created.countries },
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "shipping.zone.created", { zoneId: created.id });
    return this.getZone(ctx, created.id);
  }

  async updateZone(
    ctx: TenantContext,
    id: string,
    input: UpdateShippingZoneInput,
    meta: RequestMeta,
  ): Promise<ShippingZoneDetail> {
    const current = await this.prisma.shippingZone.findFirst({ where: { ...this.scope(ctx), id } });
    if (!current) throw new NotFoundError("Shipping zone");
    await this.prisma.shippingZone
      .update({ where: { id }, data: input })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) throw new ConflictError("A zone with this name already exists.");
        throw error;
      });
    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "shipping.zone_updated",
        resourceType: "shipping_zone",
        resourceId: id,
        before: { name: current.name },
        after: input,
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "shipping.zone.updated", { zoneId: id });
    return this.getZone(ctx, id);
  }

  async removeZone(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    const current = await this.prisma.shippingZone.findFirst({ where: { ...this.scope(ctx), id } });
    if (!current) throw new NotFoundError("Shipping zone");
    await this.prisma.shippingZone.delete({ where: { id } });
    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "shipping.zone_deleted",
        resourceType: "shipping_zone",
        resourceId: id,
        before: { name: current.name },
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "shipping.zone.deleted", { zoneId: id });
  }

  // ---- rates ------------------------------------------------------------------------------

  private async requireZone(ctx: TenantContext, zoneId: string) {
    const zone = await this.prisma.shippingZone.findFirst({ where: { ...this.scope(ctx), id: zoneId } });
    if (!zone) throw new NotFoundError("Shipping zone");
    return zone;
  }

  async createRate(
    ctx: TenantContext,
    zoneId: string,
    input: ShippingRateInput,
    meta: RequestMeta,
  ): Promise<ShippingRateSummary> {
    await this.requireZone(ctx, zoneId);
    const created = await this.prisma.shippingRate.create({
      data: {
        zoneId,
        storeId: ctx.storeId as string,
        name: input.name,
        description: input.description ?? null,
        type: input.type,
        price: BigInt(input.price),
        minSubtotal: input.minSubtotal === null || input.minSubtotal === undefined
          ? null
          : BigInt(input.minSubtotal),
        maxSubtotal: input.maxSubtotal === null || input.maxSubtotal === undefined
          ? null
          : BigInt(input.maxSubtotal),
        minWeightGrams: input.minWeightGrams ?? null,
        maxWeightGrams: input.maxWeightGrams ?? null,
        isActive: input.isActive,
        position: input.position,
      },
    });
    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "shipping.rate_created",
        resourceType: "shipping_rate",
        resourceId: created.id,
        after: { zoneId, name: created.name, type: created.type },
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "shipping.rate.created", { zoneId, rateId: created.id });
    return this.toRateSummary(created, await this.currency(ctx));
  }

  async updateRate(
    ctx: TenantContext,
    zoneId: string,
    rateId: string,
    input: UpdateShippingRateInput,
    meta: RequestMeta,
  ): Promise<ShippingRateSummary> {
    await this.requireZone(ctx, zoneId);
    const current = await this.prisma.shippingRate.findFirst({ where: { id: rateId, zoneId } });
    if (!current) throw new NotFoundError("Shipping rate");
    if (input.type === "free" && (input.price ?? 0) !== 0) {
      throw new ValidationError("Free rates must be priced at 0.", [
        { path: "price", message: "Must be 0 for free rates" },
      ]);
    }
    const data: Prisma.ShippingRateUncheckedUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.type !== undefined) data.type = input.type;
    if (input.price !== undefined) data.price = BigInt(input.price);
    if (input.minSubtotal !== undefined) {
      data.minSubtotal = input.minSubtotal === null ? null : BigInt(input.minSubtotal);
    }
    if (input.maxSubtotal !== undefined) {
      data.maxSubtotal = input.maxSubtotal === null ? null : BigInt(input.maxSubtotal);
    }
    if (input.minWeightGrams !== undefined) data.minWeightGrams = input.minWeightGrams;
    if (input.maxWeightGrams !== undefined) data.maxWeightGrams = input.maxWeightGrams;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.position !== undefined) data.position = input.position;
    const updated = await this.prisma.shippingRate.update({ where: { id: rateId }, data });
    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "shipping.rate_updated",
        resourceType: "shipping_rate",
        resourceId: rateId,
        before: { name: current.name },
        after: input,
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "shipping.rate.updated", { zoneId, rateId });
    return this.toRateSummary(updated, await this.currency(ctx));
  }

  async removeRate(ctx: TenantContext, zoneId: string, rateId: string, meta: RequestMeta) {
    await this.requireZone(ctx, zoneId);
    const current = await this.prisma.shippingRate.findFirst({ where: { id: rateId, zoneId } });
    if (!current) throw new NotFoundError("Shipping rate");
    await this.prisma.shippingRate.delete({ where: { id: rateId } });
    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "shipping.rate_deleted",
        resourceType: "shipping_rate",
        resourceId: rateId,
        before: { name: current.name },
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "shipping.rate.deleted", { zoneId, rateId });
  }
}
