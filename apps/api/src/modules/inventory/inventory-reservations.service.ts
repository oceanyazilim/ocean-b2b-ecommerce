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
