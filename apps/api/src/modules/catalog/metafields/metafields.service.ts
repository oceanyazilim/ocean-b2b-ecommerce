import { Injectable } from "@nestjs/common";
import type { MetafieldDefinition, Prisma } from "@ocean/db";
import type {
  ApiFieldError,
  MetafieldDefinitionInput,
  MetafieldDefinitionSummary,
  MetafieldOwnerType,
  MetafieldValidations,
  MetafieldValue,
  UpdateMetafieldDefinitionInput,
} from "@ocean/types";

import { ConflictError, NotFoundError, ValidationError } from "../../../common/errors/domain-error";
import type { TenantContext } from "../../../common/tenant/tenant-context";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { checkMetafieldValue } from "./validation";

function toDefinition(d: MetafieldDefinition): MetafieldDefinitionSummary {
  return {
    id: d.id,
    ownerType: d.ownerType,
    namespace: d.namespace,
    key: d.key,
    name: d.name,
    description: d.description,
    type: d.type,
    validations: (d.validations as MetafieldValidations | null) ?? {},
    createdAt: d.createdAt.toISOString(),
  };
}

@Injectable()
export class MetafieldsService {
  constructor(private readonly prisma: PrismaService) {}

  async listDefinitions(
    ctx: TenantContext,
    ownerType?: MetafieldOwnerType,
  ): Promise<MetafieldDefinitionSummary[]> {
    const rows = await this.prisma.metafieldDefinition.findMany({
      where: { storeId: ctx.storeId as string, ...(ownerType ? { ownerType } : {}) },
      orderBy: [{ ownerType: "asc" }, { namespace: "asc" }, { key: "asc" }],
    });
    return rows.map(toDefinition);
  }

  async createDefinition(
    ctx: TenantContext,
    input: MetafieldDefinitionInput,
  ): Promise<MetafieldDefinitionSummary> {
    const existing = await this.prisma.metafieldDefinition.findUnique({
      where: {
        storeId_ownerType_namespace_key: {
          storeId: ctx.storeId as string,
          ownerType: input.ownerType,
          namespace: input.namespace,
          key: input.key,
        },
      },
    });
    if (existing) {
      throw new ConflictError(
        `A definition for ${input.namespace}.${input.key} already exists on ${input.ownerType}.`,
        [{ path: "key", message: "Already defined" }],
      );
    }
    const row = await this.prisma.metafieldDefinition.create({
      data: {
        storeId: ctx.storeId as string,
        ownerType: input.ownerType,
        namespace: input.namespace,
        key: input.key,
        name: input.name,
        description: input.description ?? null,
        type: input.type,
        validations: input.validations as Prisma.InputJsonValue,
      },
    });
    return toDefinition(row);
  }

  async updateDefinition(
    ctx: TenantContext,
    id: string,
    input: UpdateMetafieldDefinitionInput,
  ): Promise<MetafieldDefinitionSummary> {
    const current = await this.prisma.metafieldDefinition.findFirst({
      where: { id, storeId: ctx.storeId as string },
    });
    if (!current) throw new NotFoundError("Metafield definition");
    const row = await this.prisma.metafieldDefinition.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.validations !== undefined
          ? { validations: input.validations as Prisma.InputJsonValue }
          : {}),
      },
    });
    return toDefinition(row);
  }

  async removeDefinition(ctx: TenantContext, id: string): Promise<void> {
    const current = await this.prisma.metafieldDefinition.findFirst({
      where: { id, storeId: ctx.storeId as string },
    });
    if (!current) throw new NotFoundError("Metafield definition");
    await this.prisma.$transaction([
      this.prisma.metafield.deleteMany({ where: { definitionId: id } }),
      this.prisma.metafieldDefinition.delete({ where: { id } }),
    ]);
  }

  async getForOwner(
    ctx: TenantContext,
    ownerType: MetafieldOwnerType,
    ownerId: string,
  ): Promise<MetafieldValue[]> {
    const rows = await this.prisma.metafield.findMany({
      where: { storeId: ctx.storeId as string, ownerType, ownerId },
      orderBy: [{ namespace: "asc" }, { key: "asc" }],
    });
    return rows.map((r) => ({
      id: r.id,
      namespace: r.namespace,
      key: r.key,
      type: r.type,
      value: r.value,
      definitionId: r.definitionId,
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  // Values must have a definition (which fixes the type). `null` clears a metafield.
  async setForOwner(
    ctx: TenantContext,
    ownerType: MetafieldOwnerType,
    ownerId: string,
    inputs: { namespace: string; key: string; value: unknown }[],
  ): Promise<MetafieldValue[]> {
    const definitions = await this.prisma.metafieldDefinition.findMany({
      where: { storeId: ctx.storeId as string, ownerType },
    });
    const byKey = new Map(definitions.map((d) => [`${d.namespace}.${d.key}`, d]));
    const errors: ApiFieldError[] = [];
    const writes: { definition: MetafieldDefinition; value: unknown }[] = [];
    const clears: MetafieldDefinition[] = [];

    for (const [i, input] of inputs.entries()) {
      const definition = byKey.get(`${input.namespace}.${input.key}`);
      if (!definition) {
        errors.push({
          path: `metafields[${i}]`,
          message: `No definition for ${input.namespace}.${input.key}`,
        });
        continue;
      }
      if (input.value === null) {
        clears.push(definition);
        continue;
      }
      const check = checkMetafieldValue(
        definition.type,
        (definition.validations as MetafieldValidations | null) ?? {},
        input.value,
      );
      if (!check.ok) {
        errors.push({ path: `metafields[${i}].value`, message: check.message });
        continue;
      }
      if (!(await this.referenceExists(ctx, definition.type, check.value))) {
        errors.push({
          path: `metafields[${i}].value`,
          message: "Referenced item is not in this store",
        });
        continue;
      }
      writes.push({ definition, value: check.value });
    }
    if (errors.length) throw new ValidationError("Some metafield values are invalid.", errors);

    await this.prisma.$transaction(async (tx) => {
      for (const d of clears) {
        await tx.metafield.deleteMany({
          where: {
            storeId: ctx.storeId as string,
            ownerType,
            ownerId,
            namespace: d.namespace,
            key: d.key,
          },
        });
      }
      for (const { definition, value } of writes) {
        const json = value as Prisma.InputJsonValue;
        await tx.metafield.upsert({
          where: {
            storeId_ownerType_ownerId_namespace_key: {
              storeId: ctx.storeId as string,
              ownerType,
              ownerId,
              namespace: definition.namespace,
              key: definition.key,
            },
          },
          update: { value: json, type: definition.type, definitionId: definition.id },
          create: {
            storeId: ctx.storeId as string,
            ownerType,
            ownerId,
            definitionId: definition.id,
            namespace: definition.namespace,
            key: definition.key,
            type: definition.type,
            value: json,
          },
        });
      }
    });
    return this.getForOwner(ctx, ownerType, ownerId);
  }

  private async referenceExists(
    ctx: TenantContext,
    type: MetafieldDefinition["type"],
    value: unknown,
  ): Promise<boolean> {
    const storeId = ctx.storeId as string;
    const id = value as string;
    switch (type) {
      case "product_reference":
        return !!(await this.prisma.product.findFirst({
          where: { id, storeId, deletedAt: null },
          select: { id: true },
        }));
      case "collection_reference":
        return !!(await this.prisma.collection.findFirst({
          where: { id, storeId, deletedAt: null },
          select: { id: true },
        }));
      case "file_reference":
        return !!(await this.prisma.media.findFirst({
          where: { id, storeId, deletedAt: null },
          select: { id: true },
        }));
      default:
        return true;
    }
  }
}
