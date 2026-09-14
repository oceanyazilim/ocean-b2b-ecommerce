import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type {
  LocationInput,
  LocationSummary,
  LocationType,
  UpdateLocationInput,
} from "@ocean/types";

import { ConflictError, NotFoundError, ValidationError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { EventsService } from "../events/events.service";

const include = {
  _count: { select: { inventoryLevels: { where: { quantity: { gt: 0 } } } } },
} satisfies Prisma.LocationInclude;
type LocationRow = Prisma.LocationGetPayload<{ include: typeof include }>;

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";

@Injectable()
export class LocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  private scope(ctx: TenantContext): Prisma.LocationWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId };
  }

  private toSummary(row: LocationRow): LocationSummary {
    return {
      id: row.id,
      name: row.name,
      type: row.type as LocationType,
      address: row.address,
      isDefault: row.isDefault,
      isActive: row.isActive,
      stockedItemCount: row._count.inventoryLevels,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async list(ctx: TenantContext): Promise<LocationSummary[]> {
    const rows = await this.prisma.location.findMany({
      where: this.scope(ctx),
      include,
      orderBy: [{ isDefault: "desc" }, { isActive: "desc" }, { name: "asc" }],
    });
    return rows.map((r) => this.toSummary(r));
  }

  async get(ctx: TenantContext, id: string): Promise<LocationSummary> {
    const row = await this.prisma.location.findFirst({
      where: { ...this.scope(ctx), id },
      include,
    });
    if (!row) throw new NotFoundError("Location");
    return this.toSummary(row);
  }

  async create(ctx: TenantContext, input: LocationInput, meta: RequestMeta) {
    const id = await this.prisma
      .$transaction(async (tx) => {
        const existing = await tx.location.count({ where: this.scope(ctx) });
        // The first location a store creates is its default, whatever the form said.
        const isDefault = input.isDefault || existing === 0;
        if (isDefault && !input.isActive) {
          throw new ValidationError("The default location must be active.", [
            { path: "isActive", message: "Default locations stay active" },
          ]);
        }
        if (isDefault) await this.clearDefault(ctx, tx);
        const created = await tx.location.create({
          data: {
            storeId: ctx.storeId as string,
            organizationId: ctx.organizationId,
            name: input.name,
            type: input.type,
            address: input.address ?? null,
            isDefault,
            isActive: input.isActive,
          },
        });
        await this.audit.record(
          {
            organizationId: ctx.organizationId,
            storeId: ctx.storeId,
            actorId: ctx.actor.id,
            action: "location.created",
            resourceType: "location",
            resourceId: created.id,
            after: { name: created.name, type: created.type, isDefault },
            meta,
          },
          tx,
        );
        await this.events.publish(
          ctx,
          "inventory.location.created",
          { locationId: created.id },
          tx,
        );
        return created.id;
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError("A location with this name already exists.", [
            { path: "name", message: "Already taken" },
          ]);
        }
        throw error;
      });
    return this.get(ctx, id);
  }

  async update(ctx: TenantContext, id: string, input: UpdateLocationInput, meta: RequestMeta) {
    await this.prisma
      .$transaction(async (tx) => {
        const current = await tx.location.findFirst({ where: { ...this.scope(ctx), id } });
        if (!current) throw new NotFoundError("Location");
        const willBeDefault = input.isDefault ?? current.isDefault;
        const willBeActive = input.isActive ?? current.isActive;
        if (current.isDefault && input.isDefault === false) {
          throw new ValidationError("Pick another location as the default instead.", [
            { path: "isDefault", message: "A store always has a default location" },
          ]);
        }
        if (willBeDefault && !willBeActive) {
          throw new ValidationError("The default location cannot be deactivated.", [
            { path: "isActive", message: "Set another default first" },
          ]);
        }
        if (input.isDefault && !current.isDefault) await this.clearDefault(ctx, tx);
        const data: Prisma.LocationUncheckedUpdateInput = {};
        if (input.name !== undefined) data.name = input.name;
        if (input.type !== undefined) data.type = input.type;
        if (input.address !== undefined) data.address = input.address;
        if (input.isDefault !== undefined) data.isDefault = input.isDefault;
        if (input.isActive !== undefined) data.isActive = input.isActive;
        await tx.location.update({ where: { id }, data });
        await this.audit.record(
          {
            organizationId: ctx.organizationId,
            storeId: ctx.storeId,
            actorId: ctx.actor.id,
            action: "location.updated",
            resourceType: "location",
            resourceId: id,
            before: {
              name: current.name,
              isDefault: current.isDefault,
              isActive: current.isActive,
            },
            after: {
              name: input.name ?? current.name,
              isDefault: willBeDefault,
              isActive: willBeActive,
            },
            meta,
          },
          tx,
        );
        await this.events.publish(ctx, "inventory.location.updated", { locationId: id }, tx);
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError("A location with this name already exists.", [
            { path: "name", message: "Already taken" },
          ]);
        }
        throw error;
      });
    return this.get(ctx, id);
  }

  async remove(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.location.findFirst({ where: { ...this.scope(ctx), id } });
      if (!current) throw new NotFoundError("Location");
      if (current.isDefault) {
        throw new ValidationError("Make another location the default before deleting this one.");
      }
      const stocked = await tx.inventoryLevel.count({
        where: { locationId: id, OR: [{ quantity: { gt: 0 } }, { reserved: { gt: 0 } }] },
      });
      if (stocked > 0) {
        throw new ValidationError(
          "This location still holds stock. Transfer or adjust it out before deleting.",
        );
      }
      const pending = await tx.transferRequest.count({
        where: { status: "pending", OR: [{ fromLocationId: id }, { toLocationId: id }] },
      });
      if (pending > 0) {
        throw new ValidationError("Resolve pending transfers involving this location first.");
      }
      await tx.transferRequest.deleteMany({
        where: { OR: [{ fromLocationId: id }, { toLocationId: id }] },
      });
      await tx.location.delete({ where: { id } });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "location.deleted",
          resourceType: "location",
          resourceId: id,
          before: { name: current.name },
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "inventory.location.deleted", { locationId: id }, tx);
    });
  }

  private async clearDefault(ctx: TenantContext, tx: Prisma.TransactionClient) {
    await tx.location.updateMany({
      where: { ...this.scope(ctx), isDefault: true },
      data: { isDefault: false },
    });
  }
}
