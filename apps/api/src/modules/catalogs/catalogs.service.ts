import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type {
  AssignmentSummary,
  AssignmentTargetInput,
  CatalogDetail,
  CatalogListQuery,
  CatalogProductEntry,
  CatalogProductListQuery,
  CatalogStatus,
  CatalogSummary,
  CreateCatalogInput,
  Paginated,
  UpdateCatalogInput,
} from "@ocean/types";

import { ConflictError, NotFoundError, ValidationError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import { isUniqueViolation } from "../../common/prisma-errors";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { STORAGE_ADAPTER, type StorageAdapter } from "../../infrastructure/storage/storage.types";
import { AuditService } from "../audit/audit.service";
import { EventsService } from "../events/events.service";
import {
  assignmentInclude,
  AssignmentTargetsService,
  toAssignmentSummary,
} from "./assignment-targets.service";

const summaryInclude = {
  _count: { select: { products: true, assignments: true } },
} satisfies Prisma.CatalogInclude;
const detailInclude = {
  ...summaryInclude,
  assignments: { include: assignmentInclude, orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.CatalogInclude;
type SummaryRow = Prisma.CatalogGetPayload<{ include: typeof summaryInclude }>;
type DetailRow = Prisma.CatalogGetPayload<{ include: typeof detailInclude }>;

@Injectable()
export class CatalogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly targets: AssignmentTargetsService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
  ) {}

  private scope(ctx: TenantContext): Prisma.CatalogWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId };
  }

  private toSummary(row: SummaryRow): CatalogSummary {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status as CatalogStatus,
      productCount: row._count.products,
      assignmentCount: row._count.assignments,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toDetail(row: DetailRow): CatalogDetail {
    return { ...this.toSummary(row), assignments: row.assignments.map(toAssignmentSummary) };
  }

  async list(ctx: TenantContext, query: CatalogListQuery): Promise<Paginated<CatalogSummary>> {
    const rows = await this.prisma.catalog.findMany({
      where: {
        ...this.scope(ctx),
        ...(query.status ? { status: query.status } : {}),
        ...(query.q ? { name: { contains: query.q, mode: "insensitive" } } : {}),
      },
      include: summaryInclude,
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

  async get(ctx: TenantContext, id: string): Promise<CatalogDetail> {
    const row = await this.prisma.catalog.findFirst({
      where: { ...this.scope(ctx), id },
      include: detailInclude,
    });
    if (!row) throw new NotFoundError("Catalog");
    return this.toDetail(row);
  }

  async create(ctx: TenantContext, input: CreateCatalogInput, meta: RequestMeta) {
    const id = await this.prisma
      .$transaction(async (tx) => {
        const created = await tx.catalog.create({
          data: {
            storeId: ctx.storeId as string,
            organizationId: ctx.organizationId,
            name: input.name,
            description: input.description ?? null,
            status: input.status,
          },
        });
        if (input.productIds?.length) {
          await this.addProductsInTx(ctx, created.id, input.productIds, tx);
        }
        await this.audit.record(
          {
            organizationId: ctx.organizationId,
            storeId: ctx.storeId,
            actorId: ctx.actor.id,
            action: "catalog.created",
            resourceType: "catalog",
            resourceId: created.id,
            after: { name: created.name, status: created.status },
            meta,
          },
          tx,
        );
        await this.events.publish(ctx, "catalog.created", { catalogId: created.id }, tx);
        return created.id;
      })
      .catch((error: unknown) => this.rethrowUnique(error));
    return this.get(ctx, id);
  }

  async update(ctx: TenantContext, id: string, input: UpdateCatalogInput, meta: RequestMeta) {
    await this.prisma
      .$transaction(async (tx) => {
        const current = await tx.catalog.findFirst({ where: { ...this.scope(ctx), id } });
        if (!current) throw new NotFoundError("Catalog");
        if (current.version !== input.version) {
          throw new ConflictError(
            "This catalog was changed by someone else. Reload to see the latest version.",
          );
        }
        const data: Prisma.CatalogUncheckedUpdateInput = { version: { increment: 1 } };
        if (input.name !== undefined) data.name = input.name;
        if (input.description !== undefined) data.description = input.description;
        if (input.status !== undefined) data.status = input.status;
        await tx.catalog.update({ where: { id }, data });
        await this.audit.record(
          {
            organizationId: ctx.organizationId,
            storeId: ctx.storeId,
            actorId: ctx.actor.id,
            action: "catalog.updated",
            resourceType: "catalog",
            resourceId: id,
            before: { name: current.name, status: current.status },
            after: { name: input.name ?? current.name, status: input.status ?? current.status },
            meta,
          },
          tx,
        );
        await this.events.publish(ctx, "catalog.updated", { catalogId: id }, tx);
      })
      .catch((error: unknown) => this.rethrowUnique(error));
    return this.get(ctx, id);
  }

  async remove(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.catalog.findFirst({ where: { ...this.scope(ctx), id } });
      if (!current) throw new NotFoundError("Catalog");
      await tx.catalog.delete({ where: { id } });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "catalog.deleted",
          resourceType: "catalog",
          resourceId: id,
          before: { name: current.name },
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "catalog.deleted", { catalogId: id }, tx);
    });
  }

  // ---- products ---------------------------------------------------------------------------------

  async listProducts(
    ctx: TenantContext,
    id: string,
    query: CatalogProductListQuery,
  ): Promise<Paginated<CatalogProductEntry>> {
    await this.require(ctx, id);
    const rows = await this.prisma.catalogProduct.findMany({
      where: {
        catalogId: id,
        product: {
          deletedAt: null,
          ...(query.q ? { title: { contains: query.q, mode: "insensitive" } } : {}),
        },
      },
      include: {
        product: {
          include: {
            _count: { select: { variants: { where: { deletedAt: null } } } },
            media: {
              orderBy: { position: "asc" },
              take: 1,
              include: { media: { select: { storageKey: true, alt: true, deletedAt: true } } },
            },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { productId: "desc" }],
      take: query.limit + 1,
      ...(query.cursor
        ? { cursor: { catalogId_productId: { catalogId: id, productId: query.cursor } }, skip: 1 }
        : {}),
    });
    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    return {
      data: page.map((r) => {
        const first = r.product.media.find((m) => !m.media.deletedAt);
        return {
          productId: r.product.id,
          title: r.product.title,
          handle: r.product.handle,
          status: r.product.status,
          vendor: r.product.vendor,
          variantCount: r.product._count.variants,
          image: first
            ? { url: this.storage.publicUrl(first.media.storageKey), alt: first.media.alt }
            : null,
          addedAt: r.createdAt.toISOString(),
        };
      }),
      pageInfo: {
        hasNextPage,
        endCursor: hasNextPage ? (page.at(-1)?.productId ?? null) : null,
      },
    };
  }

  async addProducts(ctx: TenantContext, id: string, productIds: string[], meta: RequestMeta) {
    const added = await this.prisma.$transaction(async (tx) => {
      await this.require(ctx, id, tx);
      const count = await this.addProductsInTx(ctx, id, productIds, tx);
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "catalog.products.added",
          resourceType: "catalog",
          resourceId: id,
          metadata: { count },
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "catalog.updated", { catalogId: id }, tx);
      return count;
    });
    return { added };
  }

  async removeProducts(ctx: TenantContext, id: string, productIds: string[], meta: RequestMeta) {
    const removed = await this.prisma.$transaction(async (tx) => {
      await this.require(ctx, id, tx);
      const result = await tx.catalogProduct.deleteMany({
        where: { catalogId: id, productId: { in: productIds } },
      });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "catalog.products.removed",
          resourceType: "catalog",
          resourceId: id,
          metadata: { count: result.count },
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "catalog.updated", { catalogId: id }, tx);
      return result.count;
    });
    return { removed };
  }

  // ---- assignments ------------------------------------------------------------------------------

  async addAssignment(
    ctx: TenantContext,
    id: string,
    input: AssignmentTargetInput,
    meta: RequestMeta,
  ): Promise<AssignmentSummary> {
    const row = await this.prisma
      .$transaction(async (tx) => {
        await this.require(ctx, id, tx);
        const target = await this.targets.resolve(ctx, input, tx);
        const created = await tx.catalogAssignment.create({
          data: { catalogId: id, storeId: ctx.storeId as string, ...target },
          include: assignmentInclude,
        });
        await this.audit.record(
          {
            organizationId: ctx.organizationId,
            storeId: ctx.storeId,
            actorId: ctx.actor.id,
            action: "catalog.assigned",
            resourceType: "catalog",
            resourceId: id,
            after: target,
            meta,
          },
          tx,
        );
        await this.events.publish(ctx, "catalog.assigned", { catalogId: id, ...target }, tx);
        return created;
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError("This catalog is already assigned to that target.");
        }
        throw error;
      });
    return toAssignmentSummary(row);
  }

  async removeAssignment(ctx: TenantContext, id: string, assignmentId: string, meta: RequestMeta) {
    await this.prisma.$transaction(async (tx) => {
      await this.require(ctx, id, tx);
      const current = await tx.catalogAssignment.findFirst({
        where: { id: assignmentId, catalogId: id, storeId: ctx.storeId as string },
      });
      if (!current) throw new NotFoundError("Assignment");
      await tx.catalogAssignment.delete({ where: { id: assignmentId } });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "catalog.unassigned",
          resourceType: "catalog",
          resourceId: id,
          before: { companyId: current.companyId, companyLocationId: current.companyLocationId },
          meta,
        },
        tx,
      );
      await this.events.publish(
        ctx,
        "catalog.unassigned",
        {
          catalogId: id,
          companyId: current.companyId,
          companyLocationId: current.companyLocationId,
        },
        tx,
      );
    });
  }

  // ---- internals --------------------------------------------------------------------------------

  async require(ctx: TenantContext, id: string, tx: Prisma.TransactionClient = this.prisma) {
    const row = await tx.catalog.findFirst({
      where: { ...this.scope(ctx), id },
      select: { id: true, name: true },
    });
    if (!row) throw new NotFoundError("Catalog");
    return row;
  }

  private async addProductsInTx(
    ctx: TenantContext,
    catalogId: string,
    productIds: string[],
    tx: Prisma.TransactionClient,
  ): Promise<number> {
    const unique = [...new Set(productIds)];
    const found = await tx.product.findMany({
      where: { storeId: ctx.storeId as string, deletedAt: null, id: { in: unique } },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      throw new ValidationError("One or more products are not in this store.", [
        { path: "productIds", message: "Unknown product" },
      ]);
    }
    const result = await tx.catalogProduct.createMany({
      data: found.map((p) => ({ catalogId, productId: p.id })),
      skipDuplicates: true,
    });
    return result.count;
  }

  private rethrowUnique(error: unknown): never {
    if (isUniqueViolation(error)) {
      throw new ConflictError("A catalog with this name already exists.", [
        { path: "name", message: "Already taken" },
      ]);
    }
    throw error;
  }
}
