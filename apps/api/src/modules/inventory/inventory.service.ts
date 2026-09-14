import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@ocean/db";
import {
  LOW_STOCK_THRESHOLD,
  type InventoryAdjustmentInput,
  type InventoryItemDetail,
  type InventoryItemInput,
  type InventoryItemSummary,
  type InventoryLevelSummary,
  type InventoryListQuery,
  type InventoryMovementEntry,
  type InventoryStats,
  type InventoryTransferInput,
  type InventoryVariantCandidate,
  type MovementListQuery,
  type Paginated,
  type VariantSearchQuery,
} from "@ocean/types";

import { ConflictError, NotFoundError, ValidationError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { STORAGE_ADAPTER, type StorageAdapter } from "../../infrastructure/storage/storage.types";
import { AuditService } from "../audit/audit.service";
import { EventsService } from "../events/events.service";
import { availableOf, removableFrom, stockStatus } from "./stock";

const itemInclude = {
  productVariant: {
    include: {
      product: {
        select: {
          id: true,
          title: true,
          media: {
            orderBy: { position: "asc" as const },
            take: 1,
            include: { media: { select: { storageKey: true, alt: true, deletedAt: true } } },
          },
        },
      },
    },
  },
} satisfies Prisma.InventoryItemInclude;
type ItemRow = Prisma.InventoryItemGetPayload<{ include: typeof itemInclude }>;

const movementInclude = {
  item: {
    include: { productVariant: { select: { title: true, product: { select: { title: true } } } } },
  },
  fromLocation: { select: { id: true, name: true } },
  toLocation: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.InventoryMovementInclude;
type MovementRow = Prisma.InventoryMovementGetPayload<{ include: typeof movementInclude }>;

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";

export function itemTitle(item: {
  sku: string | null;
  upc: string | null;
  productVariant: { title: string; product: { title: string } } | null;
}): string {
  if (item.productVariant) {
    const v = item.productVariant;
    return v.title === "Default Title" ? v.product.title : `${v.product.title} — ${v.title}`;
  }
  return item.sku ?? item.upc ?? "Untitled item";
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
  ) {}

  private scope(ctx: TenantContext): Prisma.InventoryItemWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId };
  }

  private toSummary(row: ItemRow): InventoryItemSummary {
    const available = availableOf({
      quantity: row.onHand,
      reserved: row.reserved,
      damaged: row.damaged,
    });
    const variant = row.productVariant;
    const image = variant?.product.media.find((m) => !m.media.deletedAt)?.media;
    return {
      id: row.id,
      trackingType: row.trackingType,
      sku: row.sku,
      upc: row.upc,
      variant: variant
        ? {
            id: variant.id,
            title: variant.title,
            productId: variant.product.id,
            productTitle: variant.product.title,
            image: image ? { url: this.storage.publicUrl(image.storageKey), alt: image.alt } : null,
          }
        : null,
      onHand: row.onHand,
      committed: row.committed,
      reserved: row.reserved,
      damaged: row.damaged,
      available,
      stockStatus: stockStatus(available),
      lastMovedAt: row.lastMovedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  // ---- reads --------------------------------------------------------------------------------

  async stats(ctx: TenantContext): Promise<InventoryStats> {
    const storeId = ctx.storeId as string;
    const [row] = await this.prisma.$queryRaw<
      { item_count: number; total_on_hand: number; low_stock: number; out_of_stock: number }[]
    >(Prisma.sql`
      SELECT count(*)::int AS item_count,
             coalesce(sum(on_hand), 0)::int AS total_on_hand,
             count(*) FILTER (WHERE on_hand - reserved - damaged BETWEEN 1 AND ${LOW_STOCK_THRESHOLD})::int AS low_stock,
             count(*) FILTER (WHERE on_hand - reserved - damaged <= 0)::int AS out_of_stock
      FROM inventory_items
      WHERE store_id = ${storeId}::uuid AND organization_id = ${ctx.organizationId}::uuid
    `);
    const locationCount = await this.prisma.location.count({
      where: { storeId, organizationId: ctx.organizationId, isActive: true },
    });
    return {
      itemCount: row?.item_count ?? 0,
      totalOnHand: row?.total_on_hand ?? 0,
      lowStock: row?.low_stock ?? 0,
      outOfStock: row?.out_of_stock ?? 0,
      locationCount,
    };
  }

  async list(
    ctx: TenantContext,
    query: InventoryListQuery,
  ): Promise<Paginated<InventoryItemSummary>> {
    const where: Prisma.InventoryItemWhereInput = {
      ...this.scope(ctx),
      ...(query.locationId ? { levels: { some: { locationId: query.locationId } } } : {}),
      ...(query.q
        ? {
            OR: [
              { sku: { contains: query.q, mode: "insensitive" } },
              { upc: { contains: query.q, mode: "insensitive" } },
              { productVariant: { title: { contains: query.q, mode: "insensitive" } } },
              {
                productVariant: { product: { title: { contains: query.q, mode: "insensitive" } } },
              },
            ],
          }
        : {}),
    };
    if (query.status) where.id = { in: await this.idsWithStatus(ctx, query.status) };
    const rows = await this.prisma.inventoryItem.findMany({
      where,
      include: itemInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    return {
      data: page.map((r) => this.toSummary(r)),
      pageInfo: { hasNextPage, endCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null },
    };
  }

  // Availability is arithmetic over three columns, which Prisma's filter API cannot express.
  private async idsWithStatus(ctx: TenantContext, status: InventoryListQuery["status"]) {
    const available = Prisma.sql`(on_hand - reserved - damaged)`;
    const condition =
      status === "out_of_stock"
        ? Prisma.sql`${available} <= 0`
        : status === "low"
          ? Prisma.sql`${available} BETWEEN 1 AND ${LOW_STOCK_THRESHOLD}`
          : Prisma.sql`${available} > ${LOW_STOCK_THRESHOLD}`;
    const rows = await this.prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM inventory_items WHERE store_id = ${ctx.storeId as string}::uuid AND ${condition}`,
    );
    return rows.map((r) => r.id);
  }

  async get(ctx: TenantContext, id: string): Promise<InventoryItemDetail> {
    const row = await this.prisma.inventoryItem.findFirst({
      where: { ...this.scope(ctx), id },
      include: { ...itemInclude, levels: true },
    });
    if (!row) throw new NotFoundError("Inventory item");
    const locations = await this.prisma.location.findMany({
      where: {
        storeId: ctx.storeId as string,
        OR: [{ isActive: true }, { inventoryLevels: { some: { itemId: id } } }],
      },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
    const byLocation = new Map(row.levels.map((l) => [l.locationId, l]));
    const levels: InventoryLevelSummary[] = locations.map((loc) => {
      const l = byLocation.get(loc.id);
      const buckets = {
        quantity: l?.quantity ?? 0,
        reserved: l?.reserved ?? 0,
        damaged: l?.damaged ?? 0,
      };
      return {
        locationId: loc.id,
        locationName: loc.name,
        locationActive: loc.isActive,
        ...buckets,
        available: availableOf(buckets),
        lastMovedAt: l?.lastMovedAt?.toISOString() ?? null,
      };
    });
    return { ...this.toSummary(row), levels };
  }

  async searchVariants(
    ctx: TenantContext,
    query: VariantSearchQuery,
  ): Promise<InventoryVariantCandidate[]> {
    const rows = await this.prisma.productVariant.findMany({
      where: {
        storeId: ctx.storeId as string,
        deletedAt: null,
        product: { deletedAt: null },
        ...(query.q
          ? {
              OR: [
                { title: { contains: query.q, mode: "insensitive" } },
                { sku: { contains: query.q, mode: "insensitive" } },
                { product: { title: { contains: query.q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      include: {
        product: { select: { id: true, title: true } },
        inventoryItems: { where: { storeId: ctx.storeId as string }, select: { id: true } },
      },
      orderBy: [{ product: { title: "asc" } }, { position: "asc" }],
      take: query.limit,
    });
    return rows.map((v) => ({
      variantId: v.id,
      productId: v.product.id,
      productTitle: v.product.title,
      variantTitle: v.title,
      sku: v.sku,
      tracked: v.inventoryItems.length > 0,
    }));
  }

  async listMovements(
    ctx: TenantContext,
    query: MovementListQuery,
  ): Promise<Paginated<InventoryMovementEntry>> {
    const where: Prisma.InventoryMovementWhereInput = {
      storeId: ctx.storeId as string,
      organizationId: ctx.organizationId,
      ...(query.itemId ? { itemId: query.itemId } : {}),
      ...(query.reason ? { reason: query.reason } : {}),
      ...(query.locationId
        ? { OR: [{ fromLocationId: query.locationId }, { toLocationId: query.locationId }] }
        : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const rows = await this.prisma.inventoryMovement.findMany({
      where,
      include: movementInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    return {
      data: page.map((m) => this.toMovement(m)),
      pageInfo: { hasNextPage, endCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null },
    };
  }

  private toMovement(m: MovementRow): InventoryMovementEntry {
    return {
      id: m.id,
      item: { id: m.itemId, sku: m.item.sku, title: itemTitle(m.item) },
      fromLocation: m.fromLocation,
      toLocation: m.toLocation,
      quantity: m.quantity,
      reason: m.reason,
      source: m.source,
      reference: m.reference,
      notes: m.notes,
      actor: m.createdBy,
      createdAt: m.createdAt.toISOString(),
    };
  }

  // ---- writes -------------------------------------------------------------------------------

  async createItem(ctx: TenantContext, input: InventoryItemInput, meta: RequestMeta) {
    const id = await this.prisma
      .$transaction(async (tx) => {
        let sku = input.sku ?? null;
        const upc = input.upc ?? null;
        let variantId: string | null = null;
        if (input.productVariantId) {
          const variant = await tx.productVariant.findFirst({
            where: { id: input.productVariantId, storeId: ctx.storeId as string, deletedAt: null },
            select: { id: true, sku: true },
          });
          if (!variant) {
            throw new ValidationError("Variant not found in this store.", [
              { path: "productVariantId", message: "Unknown variant" },
            ]);
          }
          variantId = variant.id;
          sku ??= variant.sku;
        }
        const duplicate = await tx.inventoryItem.findFirst({
          where: {
            ...this.scope(ctx),
            OR: [
              ...(variantId ? [{ productVariantId: variantId }] : []),
              ...(sku ? [{ sku }] : []),
              ...(upc ? [{ upc }] : []),
            ],
          },
          select: { id: true },
        });
        if (duplicate) throw new ConflictError("This item is already tracked.");
        const created = await tx.inventoryItem.create({
          data: {
            storeId: ctx.storeId as string,
            organizationId: ctx.organizationId,
            productVariantId: variantId,
            sku,
            upc,
            trackingType: variantId ? "variant" : sku ? "sku" : "upc",
          },
        });
        await this.audit.record(
          {
            organizationId: ctx.organizationId,
            storeId: ctx.storeId,
            actorId: ctx.actor.id,
            action: "inventory.item_created",
            resourceType: "inventory_item",
            resourceId: created.id,
            after: { trackingType: created.trackingType, sku, upc, productVariantId: variantId },
            meta,
          },
          tx,
        );
        await this.events.publish(ctx, "inventory.item.created", { itemId: created.id }, tx);
        return created.id;
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) throw new ConflictError("This item is already tracked.");
        throw error;
      });
    return this.get(ctx, id);
  }

  async adjust(ctx: TenantContext, input: InventoryAdjustmentInput, meta: RequestMeta) {
    await this.prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findFirst({
        where: { ...this.scope(ctx), id: input.itemId },
        select: { id: true },
      });
      if (!item) throw new NotFoundError("Inventory item");
      const location = await this.activeLocation(ctx, input.locationId, tx, "locationId");
      const level = await this.level(ctx, item.id, location.id, tx);
      const now = new Date();

      let delta: number;
      if (input.reason === "damage") {
        delta = input.delta ?? input.quantity! - level.damaged;
        if (delta === 0) return;
        if (delta > 0) {
          const res = await tx.inventoryLevel.updateMany({
            where: { id: level.id, quantity: { gte: level.reserved + level.damaged + delta } },
            data: { damaged: { increment: delta }, lastMovedAt: now },
          });
          if (res.count === 0) throw this.insufficient(location.name, removableFrom(level));
        } else {
          const res = await tx.inventoryLevel.updateMany({
            where: { id: level.id, damaged: { gte: -delta } },
            data: { damaged: { decrement: -delta }, lastMovedAt: now },
          });
          if (res.count === 0) {
            throw new ValidationError(`Only ${level.damaged} damaged units are recorded here.`, [
              { path: "delta", message: "Too many" },
            ]);
          }
        }
      } else {
        delta = input.delta ?? input.quantity! - level.quantity;
        if (delta === 0) return;
        if (delta < 0) {
          const res = await tx.inventoryLevel.updateMany({
            where: { id: level.id, quantity: { gte: level.reserved + level.damaged - delta } },
            data: { quantity: { decrement: -delta }, lastMovedAt: now },
          });
          if (res.count === 0) throw this.insufficient(location.name, removableFrom(level));
        } else {
          await tx.inventoryLevel.update({
            where: { id: level.id },
            data: { quantity: { increment: delta }, lastMovedAt: now },
          });
        }
      }

      // Damaged units stay on hand, so a damage entry moves them out of (or back into) the
      // sellable pool: from=location marks units damaged, to=location restores them.
      await tx.inventoryMovement.create({
        data: {
          storeId: ctx.storeId as string,
          organizationId: ctx.organizationId,
          itemId: item.id,
          fromLocationId: delta < 0 ? location.id : null,
          toLocationId: delta > 0 ? location.id : null,
          quantity: Math.abs(delta),
          reason: input.reason,
          source: "manual",
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          createdById: ctx.actor.id,
        },
      });
      await this.recomputeItem(item.id, now, tx);
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "inventory.adjusted",
          resourceType: "inventory_item",
          resourceId: item.id,
          after: { locationId: location.id, delta, reason: input.reason },
          meta,
        },
        tx,
      );
      await this.events.publish(
        ctx,
        "inventory.adjusted",
        { itemId: item.id, locationId: location.id, delta, reason: input.reason },
        tx,
      );
    });
    return this.get(ctx, input.itemId);
  }

  async transfer(ctx: TenantContext, input: InventoryTransferInput, meta: RequestMeta) {
    await this.prisma.$transaction((tx) => this.applyTransfer(ctx, input, meta, tx));
    return this.get(ctx, input.itemId);
  }

  // Shared by immediate transfers and approved transfer requests; runs in the caller's tx.
  async applyTransfer(
    ctx: TenantContext,
    input: InventoryTransferInput,
    meta: RequestMeta,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const item = await tx.inventoryItem.findFirst({
      where: { ...this.scope(ctx), id: input.itemId },
      select: { id: true },
    });
    if (!item) throw new NotFoundError("Inventory item");
    const from = await this.activeLocation(ctx, input.fromLocationId, tx, "fromLocationId");
    const to = await this.activeLocation(ctx, input.toLocationId, tx, "toLocationId");
    const now = new Date();

    const fromLevel = await this.level(ctx, item.id, from.id, tx);
    const dec = await tx.inventoryLevel.updateMany({
      where: {
        id: fromLevel.id,
        quantity: { gte: fromLevel.reserved + fromLevel.damaged + input.quantity },
      },
      data: { quantity: { decrement: input.quantity }, lastMovedAt: now },
    });
    if (dec.count === 0) throw this.insufficient(from.name, removableFrom(fromLevel));
    const toLevel = await this.level(ctx, item.id, to.id, tx);
    await tx.inventoryLevel.update({
      where: { id: toLevel.id },
      data: { quantity: { increment: input.quantity }, lastMovedAt: now },
    });
    await tx.inventoryMovement.create({
      data: {
        storeId: ctx.storeId as string,
        organizationId: ctx.organizationId,
        itemId: item.id,
        fromLocationId: from.id,
        toLocationId: to.id,
        quantity: input.quantity,
        reason: "transfer",
        source: "manual",
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        createdById: ctx.actor.id,
      },
    });
    await this.recomputeItem(item.id, now, tx);
    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "inventory.transferred",
        resourceType: "inventory_item",
        resourceId: item.id,
        after: { fromLocationId: from.id, toLocationId: to.id, quantity: input.quantity },
        meta,
      },
      tx,
    );
    await this.events.publish(
      ctx,
      "inventory.transferred",
      { itemId: item.id, fromLocationId: from.id, toLocationId: to.id, quantity: input.quantity },
      tx,
    );
  }

  async availableAt(ctx: TenantContext, itemId: string, locationId: string): Promise<number> {
    const level = await this.prisma.inventoryLevel.findFirst({
      where: { storeId: ctx.storeId as string, itemId, locationId },
    });
    return level ? removableFrom(level) : 0;
  }

  // ---- helpers ------------------------------------------------------------------------------

  private insufficient(locationName: string, available: number) {
    return new ValidationError(
      `Only ${available} sellable ${available === 1 ? "unit is" : "units are"} available at ${locationName}.`,
      [{ path: "quantity", message: "Not enough stock" }],
    );
  }

  private async activeLocation(
    ctx: TenantContext,
    id: string,
    tx: Prisma.TransactionClient,
    path: string,
  ) {
    const location = await tx.location.findFirst({
      where: { id, storeId: ctx.storeId as string, isActive: true },
      select: { id: true, name: true },
    });
    if (!location) {
      throw new ValidationError("Location not found or inactive.", [
        { path, message: "Unknown location" },
      ]);
    }
    return location;
  }

  private level(
    ctx: TenantContext,
    itemId: string,
    locationId: string,
    tx: Prisma.TransactionClient,
  ) {
    return tx.inventoryLevel.upsert({
      where: { itemId_locationId: { itemId, locationId } },
      update: {},
      create: {
        storeId: ctx.storeId as string,
        organizationId: ctx.organizationId,
        itemId,
        locationId,
      },
    });
  }

  private async recomputeItem(itemId: string, now: Date, tx: Prisma.TransactionClient) {
    const agg = await tx.inventoryLevel.aggregate({
      where: { itemId },
      _sum: { quantity: true, reserved: true, damaged: true },
    });
    await tx.inventoryItem.update({
      where: { id: itemId },
      data: {
        onHand: agg._sum.quantity ?? 0,
        reserved: agg._sum.reserved ?? 0,
        damaged: agg._sum.damaged ?? 0,
        lastMovedAt: now,
      },
    });
  }
}
