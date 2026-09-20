import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@ocean/db";
import type {
  PageInput,
  PageSummary,
  UpdatePageInput,
  BlogInput,
  UpdateBlogInput,
  BlogSummary,
  BlogDetail,
  ArticleInput,
  UpdateArticleInput,
  ArticleSummary,
  ArticleDetail,
  Paginated,
  CursorPaginationQuery,
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
      legalRequirementCode: row.legalRequirementCode,
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
          legalRequirementCode: input.legalRequirementCode ?? null,
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
    if (input.legalRequirementCode !== undefined) data.legalRequirementCode = input.legalRequirementCode;
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

  // --- Blogs ---

  private scopeBlog(ctx: TenantContext): Prisma.BlogWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId };
  }

  private scopeArticle(ctx: TenantContext): Prisma.ArticleWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId };
  }

  private toBlogSummary(row: Prisma.BlogGetPayload<{ include: { _count: { select: { articles: true } } } }>): BlogSummary {
    return {
      id: row.id,
      title: row.title,
      handle: row.handle,
      articleCount: row._count.articles,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toBlogDetail(row: Prisma.BlogGetPayload<{ include: { _count: { select: { articles: true } } } }>): BlogDetail {
    return {
      ...this.toBlogSummary(row),
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
    };
  }

  async listBlogs(ctx: TenantContext): Promise<BlogSummary[]> {
    const rows = await this.prisma.blog.findMany({
      where: this.scopeBlog(ctx),
      include: { _count: { select: { articles: true } } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => this.toBlogSummary(r));
  }

  async getBlog(ctx: TenantContext, id: string): Promise<BlogDetail> {
    const row = await this.prisma.blog.findFirst({
      where: { ...this.scopeBlog(ctx), id },
      include: { _count: { select: { articles: true } } },
    });
    if (!row) throw new NotFoundError("Blog");
    return this.toBlogDetail(row);
  }

  // Storefront-facing: every blog is listable (a blog itself has no draft/published state in
  // this model — only its articles do, same as Shopify).
  async listPublishedBlogs(ctx: TenantContext): Promise<BlogSummary[]> {
    return this.listBlogs(ctx);
  }

  async getBlogByHandle(ctx: TenantContext, handle: string): Promise<BlogDetail> {
    const row = await this.prisma.blog.findFirst({
      where: { ...this.scopeBlog(ctx), handle },
      include: { _count: { select: { articles: true } } },
    });
    if (!row) throw new NotFoundError("Blog");
    return this.toBlogDetail(row);
  }

  async createBlog(ctx: TenantContext, input: BlogInput, meta: RequestMeta): Promise<BlogDetail> {
    const created = await this.prisma.blog
      .create({
        data: {
          storeId: ctx.storeId as string,
          organizationId: ctx.organizationId,
          title: input.title,
          handle: input.handle,
          seoTitle: input.seoTitle,
          seoDescription: input.seoDescription,
          createdById: ctx.actor.id,
        },
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) throw new ConflictError("A blog with this handle already exists.");
        throw error;
      });

    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "content.blog_created",
        resourceType: "blog",
        resourceId: created.id,
        after: { title: created.title, handle: created.handle },
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "content.blog.created", { blogId: created.id });
    return this.getBlog(ctx, created.id);
  }

  async updateBlog(
    ctx: TenantContext,
    id: string,
    input: UpdateBlogInput,
    meta: RequestMeta,
  ): Promise<BlogDetail> {
    const current = await this.prisma.blog.findFirst({ where: { ...this.scopeBlog(ctx), id } });
    if (!current) throw new NotFoundError("Blog");

    const data: Prisma.BlogUncheckedUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.handle !== undefined) data.handle = input.handle;
    if (input.seoTitle !== undefined) data.seoTitle = input.seoTitle;
    if (input.seoDescription !== undefined) data.seoDescription = input.seoDescription;

    await this.prisma.blog
      .update({ where: { id }, data })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) throw new ConflictError("A blog with this handle already exists.");
        throw error;
      });

    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "content.blog_updated",
        resourceType: "blog",
        resourceId: id,
        before: { title: current.title, handle: current.handle },
        after: input,
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "content.blog.updated", { blogId: id });
    return this.getBlog(ctx, id);
  }

  async removeBlog(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    const current = await this.prisma.blog.findFirst({ where: { ...this.scopeBlog(ctx), id } });
    if (!current) throw new NotFoundError("Blog");
    // Cascades to its articles at the database level (Article.blog onDelete: Cascade).
    await this.prisma.blog.delete({ where: { id } });
    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "content.blog_deleted",
        resourceType: "blog",
        resourceId: id,
        before: { title: current.title },
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "content.blog.deleted", { blogId: id });
  }

  // --- Articles (blog-scoped) ---

  private async requireBlog(ctx: TenantContext, blogId: string): Promise<void> {
    const blog = await this.prisma.blog.findFirst({ where: { ...this.scopeBlog(ctx), id: blogId } });
    if (!blog) throw new NotFoundError("Blog");
  }

  private toArticleSummary(row: Prisma.ArticleGetPayload<Record<string, never>>): ArticleSummary {
    return {
      id: row.id,
      blogId: row.blogId,
      title: row.title,
      handle: row.handle,
      excerpt: row.excerpt,
      authorName: row.authorName,
      featuredImageUrl: row.featuredImageUrl,
      featuredImageAlt: row.featuredImageAlt,
      tags: row.tags,
      status: row.status,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toArticleDetail(row: Prisma.ArticleGetPayload<Record<string, never>>): ArticleDetail {
    return {
      ...this.toArticleSummary(row),
      bodyRich: row.bodyRich as { html?: string } | null,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
    };
  }

  async listArticles(ctx: TenantContext, blogId: string): Promise<ArticleSummary[]> {
    await this.requireBlog(ctx, blogId);
    const rows = await this.prisma.article.findMany({
      where: { ...this.scopeArticle(ctx), blogId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => this.toArticleSummary(r));
  }

  async getArticle(ctx: TenantContext, blogId: string, id: string): Promise<ArticleDetail> {
    await this.requireBlog(ctx, blogId);
    const row = await this.prisma.article.findFirst({ where: { ...this.scopeArticle(ctx), blogId, id } });
    if (!row) throw new NotFoundError("Article");
    return this.toArticleDetail(row);
  }

  async createArticle(
    ctx: TenantContext,
    blogId: string,
    input: ArticleInput,
    meta: RequestMeta,
  ): Promise<ArticleDetail> {
    await this.requireBlog(ctx, blogId);
    const created = await this.prisma.article
      .create({
        data: {
          storeId: ctx.storeId as string,
          organizationId: ctx.organizationId,
          blogId,
          title: input.title,
          handle: input.handle,
          bodyRich: input.bodyRich,
          excerpt: input.excerpt,
          authorName: input.authorName,
          featuredImageUrl: input.featuredImageUrl,
          featuredImageAlt: input.featuredImageAlt,
          tags: input.tags,
          seoTitle: input.seoTitle,
          seoDescription: input.seoDescription,
          templateSuffix: input.templateSuffix,
          status: input.status,
          publishedAt: input.status === "published" ? new Date() : null,
          createdById: ctx.actor.id,
        },
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) throw new ConflictError("An article with this handle already exists in this blog.");
        throw error;
      });

    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "content.article_created",
        resourceType: "article",
        resourceId: created.id,
        after: { title: created.title, handle: created.handle, blogId },
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "content.article.created", { articleId: created.id, blogId });
    return this.toArticleDetail(created);
  }

  async updateArticle(
    ctx: TenantContext,
    blogId: string,
    id: string,
    input: UpdateArticleInput,
    meta: RequestMeta,
  ): Promise<ArticleDetail> {
    await this.requireBlog(ctx, blogId);
    const current = await this.prisma.article.findFirst({ where: { ...this.scopeArticle(ctx), blogId, id } });
    if (!current) throw new NotFoundError("Article");

    const data: Prisma.ArticleUncheckedUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.handle !== undefined) data.handle = input.handle;
    if (input.bodyRich !== undefined) data.bodyRich = input.bodyRich;
    if (input.excerpt !== undefined) data.excerpt = input.excerpt;
    if (input.authorName !== undefined) data.authorName = input.authorName;
    if (input.featuredImageUrl !== undefined) data.featuredImageUrl = input.featuredImageUrl;
    if (input.featuredImageAlt !== undefined) data.featuredImageAlt = input.featuredImageAlt;
    if (input.tags !== undefined) data.tags = input.tags;
    if (input.seoTitle !== undefined) data.seoTitle = input.seoTitle;
    if (input.seoDescription !== undefined) data.seoDescription = input.seoDescription;
    if (input.templateSuffix !== undefined) data.templateSuffix = input.templateSuffix;
    if (input.status !== undefined) {
      data.status = input.status;
      if (input.status === "published" && current.status !== "published" && !current.publishedAt) {
        data.publishedAt = new Date();
      }
    }

    const updated = await this.prisma.article
      .update({ where: { id }, data })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) throw new ConflictError("An article with this handle already exists in this blog.");
        throw error;
      });

    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "content.article_updated",
        resourceType: "article",
        resourceId: id,
        before: { title: current.title, handle: current.handle },
        after: input,
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "content.article.updated", { articleId: id, blogId });
    return this.toArticleDetail(updated);
  }

  async removeArticle(ctx: TenantContext, blogId: string, id: string, meta: RequestMeta): Promise<void> {
    await this.requireBlog(ctx, blogId);
    const current = await this.prisma.article.findFirst({ where: { ...this.scopeArticle(ctx), blogId, id } });
    if (!current) throw new NotFoundError("Article");
    await this.prisma.article.delete({ where: { id } });
    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "content.article_deleted",
        resourceType: "article",
        resourceId: id,
        before: { title: current.title },
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "content.article.deleted", { articleId: id, blogId });
  }

  // Storefront-facing: published articles only, newest first, cursor-paginated.
  async listPublishedArticles(
    ctx: TenantContext,
    blogId: string,
    query: CursorPaginationQuery,
  ): Promise<Paginated<ArticleSummary>> {
    const rows = await this.prisma.article.findMany({
      where: { ...this.scopeArticle(ctx), blogId, status: "published" },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    return {
      data: page.map((r) => this.toArticleSummary(r)),
      pageInfo: { hasNextPage, endCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null },
    };
  }

  async getPublishedArticle(ctx: TenantContext, blogHandle: string, articleHandle: string): Promise<ArticleDetail> {
    const blog = await this.prisma.blog.findFirst({ where: { ...this.scopeBlog(ctx), handle: blogHandle } });
    if (!blog) throw new NotFoundError("Article");
    const row = await this.prisma.article.findFirst({
      where: { ...this.scopeArticle(ctx), blogId: blog.id, handle: articleHandle, status: "published" },
    });
    if (!row) throw new NotFoundError("Article");
    return this.toArticleDetail(row);
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
    // `tempId` is optional on the wire (a flat item list with no parent/child structure has no
    // need for it) — assign a request-scoped fallback for any item that omitted one, so the rest
    // of this method can keep treating it as always present.
    const byTempId = new Map<string, MenuItemInput & { tempId: string }>();
    for (const item of items) {
      const tempId = item.tempId ?? randomUUID();
      if (byTempId.has(tempId)) {
        throw new ValidationError(`Duplicate menu item id "${tempId}".`);
      }
      byTempId.set(tempId, { ...item, tempId });
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
