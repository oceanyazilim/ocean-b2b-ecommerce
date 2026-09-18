import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type {
  CreateSavedListInput,
  SavedListDetail,
  SavedListItemInput,
  SavedListSummary,
  UpdateSavedListInput,
} from "@ocean/types";

import { NotFoundError, ValidationError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { EventsService } from "../events/events.service";
import { CartsService } from "../orders/carts.service";

const include = {
  items: { include: { variant: { select: { title: true, sku: true, product: { select: { title: true } } } } } },
} satisfies Prisma.SavedListInclude;
type ListRow = Prisma.SavedListGetPayload<{ include: typeof include }>;

// A buyer's reusable shopping list (quick order). addToCart is the reason it exists: turn a
// saved list straight into cart lines without re-searching the catalog.
@Injectable()
export class SavedListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly carts: CartsService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  private scope(ctx: TenantContext): Prisma.SavedListWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId };
  }

  private toSummary(row: ListRow): SavedListSummary {
    return {
      id: row.id,
      name: row.name,
      customerId: row.customerId,
      companyId: row.companyId,
      itemCount: row.items.length,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toDetail(row: ListRow): SavedListDetail {
    return {
      ...this.toSummary(row),
      items: row.items.map((i) => ({
        id: i.id,
        variantId: i.variantId,
        title: i.variant.product.title,
        sku: i.variant.sku,
        quantity: i.quantity,
      })),
    };
  }

  private async assertVariants(ctx: TenantContext, ids: string[]) {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return;
    const found = await this.prisma.productVariant.count({
      where: { storeId: ctx.storeId as string, deletedAt: null, id: { in: unique } },
    });
    if (found !== unique.length) {
      throw new ValidationError("One or more items are not in this store.", [
        { path: "items", message: "Unknown variant" },
      ]);
    }
  }

  async list(ctx: TenantContext): Promise<SavedListSummary[]> {
    const rows = await this.prisma.savedList.findMany({
      where: this.scope(ctx),
      include,
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => this.toSummary(r));
  }

  async get(ctx: TenantContext, id: string): Promise<SavedListDetail> {
    const row = await this.prisma.savedList.findFirst({ where: { ...this.scope(ctx), id }, include });
    if (!row) throw new NotFoundError("Saved list");
    return this.toDetail(row);
  }

  async create(
    ctx: TenantContext,
    input: CreateSavedListInput,
    meta: RequestMeta,
  ): Promise<SavedListDetail> {
    const storeId = ctx.storeId as string;
    await this.assertVariants(ctx, input.items.map((i) => i.variantId));
    const created = await this.prisma.savedList.create({
      data: {
        storeId,
        organizationId: ctx.organizationId,
        name: input.name,
        customerId: input.customerId ?? null,
        companyId: input.companyId ?? null,
        items: { create: input.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })) },
      },
      include,
    });
    await this.audit.record({
      organizationId: ctx.organizationId,
      storeId,
      actorId: ctx.actor.id,
      action: "saved_list.created",
      resourceType: "saved_list",
      resourceId: created.id,
      after: { name: created.name },
      meta,
    });
    await this.events.publish(ctx, "saved_list.created", { listId: created.id });
    return this.toDetail(created);
  }

  private async requireOwn(ctx: TenantContext, id: string): Promise<ListRow> {
    const row = await this.prisma.savedList.findFirst({ where: { ...this.scope(ctx), id }, include });
    if (!row) throw new NotFoundError("Saved list");
    return row;
  }

  async update(
    ctx: TenantContext,
    id: string,
    input: UpdateSavedListInput,
    meta: RequestMeta,
  ): Promise<SavedListDetail> {
    await this.requireOwn(ctx, id);
    const updated = await this.prisma.savedList.update({
      where: { id },
      data: { ...(input.name !== undefined ? { name: input.name } : {}) },
      include,
    });
    await this.audit.record({
      organizationId: ctx.organizationId,
      storeId: ctx.storeId,
      actorId: ctx.actor.id,
      action: "saved_list.updated",
      resourceType: "saved_list",
      resourceId: id,
      meta,
    });
    return this.toDetail(updated);
  }

  async remove(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    await this.requireOwn(ctx, id);
    await this.prisma.savedList.delete({ where: { id } });
    await this.audit.record({
      organizationId: ctx.organizationId,
      storeId: ctx.storeId,
      actorId: ctx.actor.id,
      action: "saved_list.deleted",
      resourceType: "saved_list",
      resourceId: id,
      meta,
    });
  }

  async addItem(
    ctx: TenantContext,
    id: string,
    input: SavedListItemInput,
    meta: RequestMeta,
  ): Promise<SavedListDetail> {
    await this.requireOwn(ctx, id);
    await this.assertVariants(ctx, [input.variantId]);
    await this.prisma.savedListItem.upsert({
      where: { listId_variantId: { listId: id, variantId: input.variantId } },
      create: { listId: id, variantId: input.variantId, quantity: input.quantity },
      update: { quantity: { increment: input.quantity } },
    });
    await this.audit.record({
      organizationId: ctx.organizationId,
      storeId: ctx.storeId,
      actorId: ctx.actor.id,
      action: "saved_list.item_added",
      resourceType: "saved_list",
      resourceId: id,
      meta,
    });
    return this.get(ctx, id);
  }

  async updateItem(
    ctx: TenantContext,
    id: string,
    itemId: string,
    quantity: number,
    meta: RequestMeta,
  ): Promise<SavedListDetail> {
    await this.requireOwn(ctx, id);
    const item = await this.prisma.savedListItem.findFirst({ where: { id: itemId, listId: id } });
    if (!item) throw new NotFoundError("Saved list item");
    await this.prisma.savedListItem.update({ where: { id: itemId }, data: { quantity } });
    await this.audit.record({
      organizationId: ctx.organizationId,
      storeId: ctx.storeId,
      actorId: ctx.actor.id,
      action: "saved_list.item_updated",
      resourceType: "saved_list",
      resourceId: id,
      meta,
    });
    return this.get(ctx, id);
  }

  async removeItem(ctx: TenantContext, id: string, itemId: string, meta: RequestMeta): Promise<SavedListDetail> {
    await this.requireOwn(ctx, id);
    await this.prisma.savedListItem.deleteMany({ where: { id: itemId, listId: id } });
    await this.audit.record({
      organizationId: ctx.organizationId,
      storeId: ctx.storeId,
      actorId: ctx.actor.id,
      action: "saved_list.item_removed",
      resourceType: "saved_list",
      resourceId: id,
      meta,
    });
    return this.get(ctx, id);
  }

  // Adds every line in the list to an existing cart in one call — the quick-order workflow.
  async addToCart(ctx: TenantContext, id: string, cartId: string) {
    const list = await this.requireOwn(ctx, id);
    for (const item of list.items) {
      await this.carts.addItem(ctx, cartId, { variantId: item.variantId, quantity: item.quantity });
    }
    return this.carts.get(ctx, cartId);
  }
}
