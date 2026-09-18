import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";

import { ValidationError } from "../../common/errors/domain-error";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { availableOf } from "./stock";

export interface ReservationLine {
  variantId: string;
  quantity: number;
}

export interface Reservation {
  inventoryItemId: string;
  locationId: string;
  quantity: number;
}

// Holds stock for orders. A reservation moves units from "available" to "reserved" at one or
// more active locations (default location first) without touching on-hand; fulfilment turns
// it into a movement later, cancellation releases it. Variants without an inventory item are
// untracked and never reserve anything.
@Injectable()
export class InventoryReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  // Sellable units across active locations per variant; null = untracked.
  async availability(
    ctx: TenantContext,
    variantIds: readonly string[],
  ): Promise<Map<string, number | null>> {
    const result = new Map<string, number | null>(variantIds.map((id) => [id, null]));
    if (variantIds.length === 0) return result;
    const items = await this.prisma.inventoryItem.findMany({
      where: { storeId: ctx.storeId as string, productVariantId: { in: [...variantIds] } },
      include: { levels: { where: { location: { isActive: true } } } },
    });
    for (const item of items) {
      const available = item.levels.reduce((sum, l) => sum + Math.max(0, availableOf(l)), 0);
      result.set(item.productVariantId as string, available);
    }
    return result;
  }

  async reserve(
    ctx: TenantContext,
    lines: readonly ReservationLine[],
    tx: Prisma.TransactionClient,
  ): Promise<Map<string, Reservation[]>> {
    const storeId = ctx.storeId as string;
    const out = new Map<string, Reservation[]>();
    for (const line of lines) {
      const item = await tx.inventoryItem.findFirst({
        where: { storeId, productVariantId: line.variantId },
        include: {
          levels: {
            where: { location: { isActive: true } },
            include: { location: { select: { isDefault: true, name: true } } },
          },
        },
      });
      if (!item) {
        out.set(line.variantId, []);
        continue;
      }
      const levels = [...item.levels].sort(
        (a, b) =>
          Number(b.location.isDefault) - Number(a.location.isDefault) ||
          availableOf(b) - availableOf(a),
      );
      let remaining = line.quantity;
      const taken: Reservation[] = [];
      for (const level of levels) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, Math.max(0, availableOf(level)));
        if (take <= 0) continue;
        // Guarded update: another checkout may have consumed the units since we read them.
        const updated = await tx.inventoryLevel.updateMany({
          where: {
            id: level.id,
            quantity: { gte: level.reserved + level.damaged + take },
            reserved: level.reserved,
          },
          data: { reserved: { increment: take } },
        });
        if (updated.count === 0) continue;
        taken.push({ inventoryItemId: item.id, locationId: level.locationId, quantity: take });
        remaining -= take;
      }
      if (remaining > 0) {
        // Roll back what this line took; the transaction will abort on the throw anyway.
        const available = line.quantity - remaining;
        throw new ValidationError(
          `Only ${available} ${available === 1 ? "unit is" : "units are"} available for ${item.sku ?? "this item"}.`,
          [{ path: `items.${line.variantId}`, message: "Not enough stock" }],
        );
      }
      await this.recomputeItem(item.id, tx);
      out.set(line.variantId, taken);
    }
    return out;
  }

  async release(
    ctx: TenantContext,
    reservations: readonly Reservation[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const storeId = ctx.storeId as string;
    const touched = new Set<string>();
    for (const r of reservations) {
      await tx.inventoryLevel.updateMany({
        where: { storeId, itemId: r.inventoryItemId, locationId: r.locationId },
        data: { reserved: { decrement: r.quantity } },
      });
      touched.add(r.inventoryItemId);
    }
    for (const itemId of touched) await this.recomputeItem(itemId, tx);
  }

  // Adds fresh, unreserved on-hand stock back after a received return or a refund with
  // restock=true — the original order is done (closed / refunded), so these units are free for
  // any order to claim. `reference` lands on the movement row for the audit trail; a variant
  // with no tracked inventory item is a no-op (nothing to restock).
  async restockVariant(
    ctx: TenantContext,
    tx: Prisma.TransactionClient,
    input: {
      variantId: string;
      locationId: string;
      quantity: number;
      reason: "return";
      reference: string;
    },
  ): Promise<void> {
    const storeId = ctx.storeId as string;
    const inventoryItem = await tx.inventoryItem.findFirst({
      where: { storeId, productVariantId: input.variantId },
    });
    if (!inventoryItem) return;
    await tx.inventoryLevel.upsert({
      where: { itemId_locationId: { itemId: inventoryItem.id, locationId: input.locationId } },
      update: { quantity: { increment: input.quantity } },
      create: {
        storeId,
        organizationId: ctx.organizationId,
        itemId: inventoryItem.id,
        locationId: input.locationId,
        quantity: input.quantity,
      },
    });
    await tx.inventoryMovement.create({
      data: {
        storeId,
        organizationId: ctx.organizationId,
        itemId: inventoryItem.id,
        fromLocationId: null,
        toLocationId: input.locationId,
        quantity: input.quantity,
        reason: input.reason,
        source: "system",
        reference: input.reference,
        createdById: ctx.actor.id,
      },
    });
    await this.recomputeItem(inventoryItem.id, tx);
  }

  // Undoes a fulfilment: on-hand AND reserved both go back up, and a fresh reservation row is
  // recreated for the order item, because the order is still open and still owes these units —
  // unlike restockVariant, this stock must not be free for a different order to claim.
  async restoreFulfillmentReservation(
    ctx: TenantContext,
    tx: Prisma.TransactionClient,
    input: {
      orderItemId: string;
      variantId: string;
      locationId: string;
      quantity: number;
      reference: string;
    },
  ): Promise<void> {
    const storeId = ctx.storeId as string;
    const inventoryItem = await tx.inventoryItem.findFirst({
      where: { storeId, productVariantId: input.variantId },
    });
    if (!inventoryItem) return;
    await tx.inventoryLevel.upsert({
      where: { itemId_locationId: { itemId: inventoryItem.id, locationId: input.locationId } },
      update: { quantity: { increment: input.quantity }, reserved: { increment: input.quantity } },
      create: {
        storeId,
        organizationId: ctx.organizationId,
        itemId: inventoryItem.id,
        locationId: input.locationId,
        quantity: input.quantity,
        reserved: input.quantity,
      },
    });
    await tx.orderItemReservation.create({
      data: {
        orderItemId: input.orderItemId,
        storeId,
        inventoryItemId: inventoryItem.id,
        locationId: input.locationId,
        quantity: input.quantity,
      },
    });
    await tx.inventoryMovement.create({
      data: {
        storeId,
        organizationId: ctx.organizationId,
        itemId: inventoryItem.id,
        fromLocationId: null,
        toLocationId: input.locationId,
        quantity: input.quantity,
        reason: "fulfillment",
        source: "system",
        reference: input.reference,
        createdById: ctx.actor.id,
      },
    });
    await this.recomputeItem(inventoryItem.id, tx);
  }

  private async recomputeItem(itemId: string, tx: Prisma.TransactionClient) {
    const agg = await tx.inventoryLevel.aggregate({
      where: { itemId },
      _sum: { quantity: true, reserved: true, damaged: true },
    });
    await tx.inventoryItem.update({
      where: { id: itemId },
      data: {
        onHand: agg._sum.quantity ?? 0,
        reserved: Math.max(0, agg._sum.reserved ?? 0),
        damaged: agg._sum.damaged ?? 0,
      },
    });
  }
}
