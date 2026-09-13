import { Injectable } from "@nestjs/common";
import type { Category, Prisma } from "@ocean/db";
import type { CategoryInput, CategoryNode, UpdateCategoryInput } from "@ocean/types";
import { slugify } from "@ocean/utils";

import { ConflictError, NotFoundError, ValidationError } from "../../../common/errors/domain-error";
import type { TenantContext } from "../../../common/tenant/tenant-context";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";

const MAX_DEPTH = 5;

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async tree(ctx: TenantContext): Promise<CategoryNode[]> {
    const rows = await this.prisma.category.findMany({
      where: { storeId: ctx.storeId as string },
      orderBy: [{ position: "asc" }, { name: "asc" }],
      include: { _count: { select: { products: { where: { deletedAt: null } } } } },
    });
    const nodes = new Map<string, CategoryNode>();
    for (const r of rows) {
      nodes.set(r.id, {
        id: r.id,
        name: r.name,
        handle: r.handle,
        path: r.path,
        parentId: r.parentId,
        position: r.position,
        productCount: r._count.products,
        children: [],
      });
    }
    const roots: CategoryNode[] = [];
    for (const node of nodes.values()) {
      const parent = node.parentId ? nodes.get(node.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  async create(ctx: TenantContext, input: CategoryInput): Promise<CategoryNode> {
    const created = await this.prisma.$transaction(async (tx) => {
      const parent = await this.parentFor(ctx, input.parentId ?? null, tx);
      const handle = input.handle ?? slugify(input.name) ?? "category";
      const path = parent ? `${parent.path}/${handle}` : handle;
      if (path.split("/").length > MAX_DEPTH)
        throw new ValidationError(`Categories can be at most ${MAX_DEPTH} levels deep.`);
      await this.assertPathFree(ctx, path, null, tx);
      return tx.category.create({
        data: {
          storeId: ctx.storeId as string,
          parentId: parent?.id ?? null,
          name: input.name,
          handle,
          path,
          position: input.position ?? 0,
        },
      });
    });
    return this.node(created);
  }

  async update(ctx: TenantContext, id: string, input: UpdateCategoryInput): Promise<CategoryNode> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.category.findFirst({
        where: { id, storeId: ctx.storeId as string },
      });
      if (!current) throw new NotFoundError("Category");
      const parentId = input.parentId === undefined ? current.parentId : input.parentId;
      if (parentId === id) throw new ValidationError("A category cannot be its own parent.");
      const parent = await this.parentFor(ctx, parentId, tx);
      if (parent && parent.path.startsWith(`${current.path}/`)) {
        throw new ValidationError("Cannot move a category under one of its own children.");
      }
      const handle =
        input.handle ?? (input.name && !input.handle ? current.handle : current.handle);
      const path = parent ? `${parent.path}/${handle}` : handle;
      if (path !== current.path) await this.assertPathFree(ctx, path, id, tx);

      const row = await tx.category.update({
        where: { id },
        data: {
          name: input.name ?? current.name,
          handle,
          parentId: parent?.id ?? null,
          path,
          position: input.position ?? current.position,
        },
      });
      if (path !== current.path) {
        const descendants = await tx.category.findMany({
          where: { storeId: ctx.storeId as string, path: { startsWith: `${current.path}/` } },
        });
        for (const d of descendants) {
          await tx.category.update({
            where: { id: d.id },
            data: { path: `${path}${d.path.slice(current.path.length)}` },
          });
        }
      }
      return row;
    });
    return this.node(updated);
  }

  async remove(ctx: TenantContext, id: string): Promise<void> {
    const current = await this.prisma.category.findFirst({
      where: { id, storeId: ctx.storeId as string },
    });
    if (!current) throw new NotFoundError("Category");
    // Children cascade via FK; products are detached by the SetNull relation.
    await this.prisma.category.delete({ where: { id } });
  }

  private async parentFor(
    ctx: TenantContext,
    parentId: string | null,
    tx: Prisma.TransactionClient,
  ): Promise<Category | null> {
    if (!parentId) return null;
    const parent = await tx.category.findFirst({
      where: { id: parentId, storeId: ctx.storeId as string },
    });
    if (!parent)
      throw new ValidationError("Parent category not found.", [
        { path: "parentId", message: "Unknown category" },
      ]);
    return parent;
  }

  private async assertPathFree(
    ctx: TenantContext,
    path: string,
    excludeId: string | null,
    tx: Prisma.TransactionClient,
  ) {
    const existing = await tx.category.findUnique({
      where: { storeId_path: { storeId: ctx.storeId as string, path } },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictError("A category with this handle already exists at this level.", [
        { path: "handle", message: "Already taken" },
      ]);
    }
  }

  private node(c: Category): CategoryNode {
    return {
      id: c.id,
      name: c.name,
      handle: c.handle,
      path: c.path,
      parentId: c.parentId,
      position: c.position,
      productCount: 0,
      children: [],
    };
  }
}
