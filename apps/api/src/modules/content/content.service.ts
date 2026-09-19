import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type {
  PageInput,
  PageSummary,
  UpdatePageInput,
  MenuInput,
  MenuSummary,
  MenuItemInput,
  MenuItemSummary,
  UpdateMenuInput,
} from "@ocean/types";

import { ConflictError, NotFoundError, ValidationError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { EventsService } from "../events/events.service";

type PageRow = Prisma.PageGetPayload<Record<string, never>>;
type MenuRow = Prisma.MenuGetPayload<{ include: { items: true } }>;

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  private scope(ctx: TenantContext): Prisma.PageWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId };
  }

  private scopeMenu(ctx: TenantContext): Prisma.MenuWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId };
  }

  // --- Pages ---

  private toPageSummary(row: PageRow): PageSummary {
    return {
      id: row.id,
      title: row.title,
      handle: row.handle,
      status: row.status,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async listPages(ctx: TenantContext): Promise<PageSummary[]> {
    const rows = await this.prisma.page.findMany({
      where: this.scope(ctx),
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => this.toPageSummary(r));
  }

  async getPage(ctx: TenantContext, id: string): Promise<PageRow> {
    const row = await this.prisma.page.findFirst({
      where: { ...this.scope(ctx), id },
    });
    if (!row) throw new NotFoundError("Page");
    return row;
  }

  // Storefront-facing: published pages only, never drafts/archived.
  async listPublishedPages(ctx: TenantContext): Promise<PageSummary[]> {
    const rows = await this.prisma.page.findMany({
      where: { ...this.scope(ctx), status: "published" },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => this.toPageSummary(r));
  }

  async getPublishedPage(ctx: TenantContext, handle: string): Promise<PageRow> {
    const row = await this.prisma.page.findFirst({
      where: { ...this.scope(ctx), handle, status: "published" },
    });
    if (!row) throw new NotFoundError("Page");
    return row;
  }

  async createPage(ctx: TenantContext, input: PageInput, meta: RequestMeta): Promise<PageSummary> {
    const created = await this.prisma.page
      .create({
        data: {
          storeId: ctx.storeId as string,
          organizationId: ctx.organizationId,
          title: input.title,
          handle: input.handle,
          bodyRich: input.bodyRich,
          seoTitle: input.seoTitle,
          seoDescription: input.seoDescription,
          templateSuffix: input.templateSuffix,
          status: input.status,
          publishedAt: input.status === "published" ? new Date() : null,
          createdById: ctx.actor.id,
        },
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) throw new ConflictError("A page with this handle already exists.");
        throw error;
      });

    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "content.page_created",
        resourceType: "page",
        resourceId: created.id,
        after: { title: created.title, handle: created.handle },
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "content.page.created", { pageId: created.id });
    return this.toPageSummary(created);
  }

  async updatePage(
    ctx: TenantContext,
    id: string,
    input: UpdatePageInput,
    meta: RequestMeta,
  ): Promise<PageSummary> {
    const current = await this.prisma.page.findFirst({ where: { ...this.scope(ctx), id } });
    if (!current) throw new NotFoundError("Page");

    const data: Prisma.PageUncheckedUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.handle !== undefined) data.handle = input.handle;
    if (input.bodyRich !== undefined) data.bodyRich = input.bodyRich;
    if (input.seoTitle !== undefined) data.seoTitle = input.seoTitle;
    if (input.seoDescription !== undefined) data.seoDescription = input.seoDescription;
    if (input.templateSuffix !== undefined) data.templateSuffix = input.templateSuffix;
    if (input.status !== undefined) {
      data.status = input.status;
      if (input.status === "published" && current.status !== "published" && !current.publishedAt) {
        data.publishedAt = new Date();
      }
    }

    const updated = await this.prisma.page
      .update({ where: { id }, data })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) throw new ConflictError("A page with this handle already exists.");
        throw error;
      });

    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "content.page_updated",
        resourceType: "page",
        resourceId: id,
        before: { title: current.title, handle: current.handle },
        after: input,
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "content.page.updated", { pageId: id });
    return this.toPageSummary(updated);
  }

  async removePage(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    const current = await this.prisma.page.findFirst({ where: { ...this.scope(ctx), id } });
    if (!current) throw new NotFoundError("Page");
    
    await this.prisma.page.delete({ where: { id } });
    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "content.page_deleted",
        resourceType: "page",
        resourceId: id,
        before: { title: current.title },
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "content.page.deleted", { pageId: id });
  }

  // --- Menus ---

  private toMenuSummary(row: MenuRow): MenuSummary {
    const buildTree = (items: typeof row.items, parentId: string | null = null): MenuItemSummary[] => {
      return items
        .filter(item => item.parentId === parentId)
        .sort((a, b) => a.position - b.position)
        .map(item => ({
          id: item.id,
          label: item.label,
          url: item.url,
          position: item.position,
          linkType: (item.linkType as MenuItemSummary["linkType"]) ?? null,
          resourceId: item.resourceId,
          megaMenuEnabled: item.megaMenuEnabled,
          promoImageUrl: item.promoImageUrl,
          promoImageAlt: item.promoImageAlt,
          promoLinkLabel: item.promoLinkLabel,
          promoLinkUrl: item.promoLinkUrl,
          children: buildTree(items, item.id),
        }));
    };

    return {
      id: row.id,
      title: row.title,
      handle: row.handle,
      items: buildTree(row.items),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async listMenus(ctx: TenantContext): Promise<MenuSummary[]> {
    const rows = await this.prisma.menu.findMany({
      where: this.scopeMenu(ctx),
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => this.toMenuSummary(r));
  }

  async getMenu(ctx: TenantContext, id: string): Promise<MenuSummary> {
    const row = await this.prisma.menu.findFirst({
      where: { ...this.scopeMenu(ctx), id },
      include: { items: true },
    });
    if (!row) throw new NotFoundError("Menu");
    return this.toMenuSummary(row);
  }

  // Items form a tree via self-referencing parentId, but a client save has no server-assigned
  // ids yet — items reference each other by client `tempId`. Create level-by-level (parents
  // before children) inside the transaction so each parent's real db id is known before its
  // children are written.
  private async createMenuItemsTree(
    tx: Prisma.TransactionClient,
    menuId: string,
    items: MenuItemInput[],
  ): Promise<void> {
    const byTempId = new Map<string, MenuItemInput>();
    for (const item of items) {
      if (byTempId.has(item.tempId)) {
        throw new ValidationError(`Duplicate menu item id "${item.tempId}".`);
      }
      byTempId.set(item.tempId, item);
    }

    const resolvedIds = new Map<string, string>(); // tempId -> real db id
    const pending = new Set(byTempId.keys());
    let guard = pending.size + 1;

    while (pending.size > 0) {
      if (guard-- <= 0) {
        throw new ValidationError("Menu items form an invalid or circular parent/child structure.");
      }
      let progressed = false;
      for (const tempId of [...pending]) {
        const item = byTempId.get(tempId) as MenuItemInput;
        const parentTempId = item.parentId ?? null;
        let parentDbId: string | null = null;
        if (parentTempId) {
          if (!byTempId.has(parentTempId)) {
            throw new ValidationError(`Menu item "${item.label}" references an unknown parent.`);
          }
          const resolved = resolvedIds.get(parentTempId);
          if (resolved === undefined) continue; // parent not created yet, retry next pass
          parentDbId = resolved;
        }
        const createdItem = await tx.menuItem.create({
          data: {
            menuId,
            parentId: parentDbId,
            label: item.label,
            url: item.url ?? null,
            position: item.position,
            linkType: item.linkType ?? null,
            resourceId: item.resourceId ?? null,
            megaMenuEnabled: item.megaMenuEnabled ?? false,
            promoImageUrl: item.promoImageUrl ?? null,
            promoImageAlt: item.promoImageAlt ?? null,
            promoLinkLabel: item.promoLinkLabel ?? null,
            promoLinkUrl: item.promoLinkUrl ?? null,
          },
        });
        resolvedIds.set(tempId, createdItem.id);
        pending.delete(tempId);
        progressed = true;
      }
      if (!progressed) {
        throw new ValidationError("Menu items form an invalid or circular parent/child structure.");
      }
    }
  }

  async createMenu(ctx: TenantContext, input: MenuInput, meta: RequestMeta): Promise<MenuSummary> {
    const created = await this.prisma
      .$transaction(async (tx) => {
        const menu = await tx.menu
          .create({
            data: {
              storeId: ctx.storeId as string,
              organizationId: ctx.organizationId,
              title: input.title,
              handle: input.handle,
            },
          })
          .catch((error: unknown) => {
            if (isUniqueViolation(error)) throw new ConflictError("A menu with this handle already exists.");
            throw error;
          });
        if (input.items && input.items.length > 0) {
          await this.createMenuItemsTree(tx, menu.id, input.items);
        }
        return menu;
      });

    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "content.menu_created",
        resourceType: "menu",
        resourceId: created.id,
        after: { title: created.title, handle: created.handle },
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "content.menu.created", { menuId: created.id });
    return this.getMenu(ctx, created.id);
  }

  async updateMenu(
    ctx: TenantContext,
    id: string,
    input: UpdateMenuInput,
    meta: RequestMeta,
  ): Promise<MenuSummary> {
    const current = await this.prisma.menu.findFirst({ where: { ...this.scopeMenu(ctx), id } });
    if (!current) throw new NotFoundError("Menu");

    const data: Prisma.MenuUncheckedUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.handle !== undefined) data.handle = input.handle;

    await this.prisma
      .$transaction(async (tx) => {
        if (Object.keys(data).length > 0) {
          await tx.menu.update({ where: { id }, data });
        }
        // Items have no stable identity of their own from the client's perspective — a save
        // always sends the whole list, same as a theme template's configuration.
        if (input.items !== undefined) {
          await tx.menuItem.deleteMany({ where: { menuId: id } });
          if (input.items.length > 0) {
            await this.createMenuItemsTree(tx, id, input.items);
          }
        }
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) throw new ConflictError("A menu with this handle already exists.");
        throw error;
      });

    await this.audit.record({
      organizationId: ctx.organizationId,
      storeId: ctx.storeId,
      actorId: ctx.actor.id,
      action: "content.menu_updated",
      resourceType: "menu",
      resourceId: id,
      meta,
    });
    await this.events.publish(ctx, "content.menu.updated", { menuId: id });
    return this.getMenu(ctx, id);
  }

  async removeMenu(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    const current = await this.prisma.menu.findFirst({ where: { ...this.scopeMenu(ctx), id } });
    if (!current) throw new NotFoundError("Menu");
    await this.prisma.menu.delete({ where: { id } });
    await this.audit.record({
      organizationId: ctx.organizationId,
      storeId: ctx.storeId,
      actorId: ctx.actor.id,
      action: "content.menu_deleted",
      resourceType: "menu",
      resourceId: id,
      before: { title: current.title },
      meta,
    });
    await this.events.publish(ctx, "content.menu.deleted", { menuId: id });
  }
}
