import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type {
  Paginated,
  TransferDecisionInput,
  TransferListQuery,
  TransferRequestInput,
  TransferRequestSummary,
} from "@ocean/types";

import { ConflictError, NotFoundError, ValidationError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { EventsService } from "../events/events.service";
import { InventoryService, itemTitle } from "./inventory.service";

const include = {
  item: {
    include: { productVariant: { select: { title: true, product: { select: { title: true } } } } },
  },
  fromLocation: { select: { id: true, name: true } },
  toLocation: { select: { id: true, name: true } },
  requestedBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
} satisfies Prisma.TransferRequestInclude;
type Row = Prisma.TransferRequestGetPayload<{ include: typeof include }>;

@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  private scope(ctx: TenantContext): Prisma.TransferRequestWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId };
  }

  private toSummary(row: Row): TransferRequestSummary {
    return {
      id: row.id,
      item: { id: row.itemId, sku: row.item.sku, title: itemTitle(row.item) },
      fromLocation: row.fromLocation,
      toLocation: row.toLocation,
      quantity: row.quantity,
      status: row.status,
      requestedBy: row.requestedBy,
      approvedBy: row.approvedBy,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      rejectionReason: row.rejectionReason,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async list(
    ctx: TenantContext,
    query: TransferListQuery,
  ): Promise<Paginated<TransferRequestSummary>> {
    const rows = await this.prisma.transferRequest.findMany({
      where: { ...this.scope(ctx), ...(query.status ? { status: query.status } : {}) },
      include,
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

  async get(ctx: TenantContext, id: string): Promise<TransferRequestSummary> {
    const row = await this.prisma.transferRequest.findFirst({
      where: { ...this.scope(ctx), id },
      include,
    });
    if (!row) throw new NotFoundError("Transfer request");
    return this.toSummary(row);
  }

  async create(ctx: TenantContext, input: TransferRequestInput, meta: RequestMeta) {
    const id = await this.prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findFirst({
        where: {
          storeId: ctx.storeId as string,
          organizationId: ctx.organizationId,
          id: input.itemId,
        },
        select: { id: true },
      });
      if (!item) throw new NotFoundError("Inventory item");
      const locations = await tx.location.findMany({
        where: {
          storeId: ctx.storeId as string,
          isActive: true,
          id: { in: [input.fromLocationId, input.toLocationId] },
        },
        select: { id: true, name: true },
      });
      if (locations.length !== 2) {
        throw new ValidationError("Both locations must exist in this store and be active.", [
          { path: "toLocationId", message: "Unknown location" },
        ]);
      }
      const available = await this.inventory.availableAt(ctx, item.id, input.fromLocationId);
      if (available < input.quantity) {
        const from = locations.find((l) => l.id === input.fromLocationId);
        throw new ValidationError(
          `Only ${available} units are available at ${from?.name ?? "source"}.`,
          [{ path: "quantity", message: "Not enough stock" }],
        );
      }
      const created = await tx.transferRequest.create({
        data: {
          storeId: ctx.storeId as string,
          organizationId: ctx.organizationId,
          itemId: item.id,
          fromLocationId: input.fromLocationId,
          toLocationId: input.toLocationId,
          quantity: input.quantity,
          requestedById: ctx.actor.id,
        },
      });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "inventory.transfer_requested",
          resourceType: "transfer_request",
          resourceId: created.id,
          after: { itemId: item.id, quantity: input.quantity },
          meta,
        },
        tx,
      );
      await this.events.publish(
        ctx,
        "inventory.transfer.requested",
        { transferId: created.id },
        tx,
      );
      return created.id;
    });
    return this.get(ctx, id);
  }

  async decide(ctx: TenantContext, id: string, input: TransferDecisionInput, meta: RequestMeta) {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.transferRequest.findFirst({ where: { ...this.scope(ctx), id } });
      if (!current) throw new NotFoundError("Transfer request");
      if (current.status !== "pending") {
        throw new ConflictError(`This transfer was already ${current.status}.`);
      }
      const now = new Date();
      if (input.status === "approved") {
        await this.inventory.applyTransfer(
          ctx,
          {
            itemId: current.itemId,
            fromLocationId: current.fromLocationId,
            toLocationId: current.toLocationId,
            quantity: current.quantity,
            reference: `transfer:${current.id}`,
          },
          meta,
          tx,
        );
      }
      await tx.transferRequest.update({
        where: { id },
        data: {
          status: input.status,
          approvedById: input.status === "cancelled" ? null : ctx.actor.id,
          approvedAt: input.status === "cancelled" ? null : now,
          rejectionReason: input.status === "rejected" ? (input.rejectionReason ?? null) : null,
        },
      });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: `inventory.transfer_${input.status}`,
          resourceType: "transfer_request",
          resourceId: id,
          before: { status: "pending" },
          after: { status: input.status, rejectionReason: input.rejectionReason ?? null },
          meta,
        },
        tx,
      );
      await this.events.publish(
        ctx,
        `inventory.transfer.${input.status}`,
        { transferId: id, itemId: current.itemId, quantity: current.quantity },
        tx,
      );
    });
    return this.get(ctx, id);
  }
}
