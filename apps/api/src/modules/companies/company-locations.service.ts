import { Injectable } from "@nestjs/common";
import { Prisma } from "@ocean/db";
import type {
  CompanyLocationSummary,
  CreateCompanyLocationInput,
  UpdateCompanyLocationInput,
} from "@ocean/types";

import { ConflictError, NotFoundError, ValidationError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import { isUniqueViolation } from "../../common/prisma-errors";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { EventsService } from "../events/events.service";
import { companyLocationInclude, toCompanyLocationSummary } from "./company.mapper";
import { CompaniesService } from "./companies.service";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

@Injectable()
export class CompanyLocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  private scope(ctx: TenantContext, companyId: string): Prisma.CompanyLocationWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId, companyId };
  }

  async list(ctx: TenantContext, companyId: string): Promise<CompanyLocationSummary[]> {
    await this.companies.require(ctx, companyId);
    const [rows, allLocationUsers] = await Promise.all([
      this.prisma.companyLocation.findMany({
        where: this.scope(ctx, companyId),
        include: companyLocationInclude,
        orderBy: [{ isDefault: "desc" }, { isActive: "desc" }, { name: "asc" }],
      }),
      this.countAllLocationUsers(companyId),
    ]);
    return rows.map((r) => toCompanyLocationSummary(r, allLocationUsers));
  }

  async get(ctx: TenantContext, companyId: string, id: string): Promise<CompanyLocationSummary> {
    const row = await this.prisma.companyLocation.findFirst({
      where: { ...this.scope(ctx, companyId), id, company: { deletedAt: null } },
      include: companyLocationInclude,
    });
    if (!row) throw new NotFoundError("Company location");
    return toCompanyLocationSummary(row, await this.countAllLocationUsers(companyId));
  }

  async create(
    ctx: TenantContext,
    companyId: string,
    input: CreateCompanyLocationInput,
    meta: RequestMeta,
  ): Promise<CompanyLocationSummary> {
    const id = await this.prisma
      .$transaction(async (tx) => {
        await this.companies.require(ctx, companyId, tx);
        const existing = await tx.companyLocation.count({ where: this.scope(ctx, companyId) });
        const isDefault = input.isDefault || existing === 0;
        if (isDefault && !input.isActive) {
          throw new ValidationError("The default location must be active.", [
            { path: "isActive", message: "Default locations stay active" },
          ]);
        }
        if (isDefault) await this.clearDefault(ctx, companyId, tx);
        const created = await tx.companyLocation.create({
          data: {
            companyId,
            storeId: ctx.storeId as string,
            organizationId: ctx.organizationId,
            name: input.name,
            externalId: input.externalId ?? null,
            phone: input.phone ?? null,
            email: input.email ?? null,
            shippingAddress: json(input.shippingAddress),
            billingAddress: input.billingAddress ? json(input.billingAddress) : undefined,
            currency: input.currency ?? null,
            taxExempt: input.taxExempt,
            taxNumber: input.taxNumber ?? null,
            isDefault,
            isActive: input.isActive,
            note: input.note ?? null,
          },
        });
        await this.audit.record(
          {
            organizationId: ctx.organizationId,
            storeId: ctx.storeId,
            actorId: ctx.actor.id,
            action: "company.location.created",
            resourceType: "company",
            resourceId: companyId,
            after: { locationId: created.id, name: created.name, isDefault },
            meta,
          },
          tx,
        );
        await this.events.publish(
          ctx,
          "company.location.created",
          { companyId, locationId: created.id },
          tx,
        );
        return created.id;
      })
      .catch((error: unknown) => this.rethrowUnique(error));
    return this.get(ctx, companyId, id);
  }

  async update(
    ctx: TenantContext,
    companyId: string,
    id: string,
    input: UpdateCompanyLocationInput,
    meta: RequestMeta,
  ): Promise<CompanyLocationSummary> {
    await this.prisma
      .$transaction(async (tx) => {
        await this.companies.require(ctx, companyId, tx);
        const current = await tx.companyLocation.findFirst({
          where: { ...this.scope(ctx, companyId), id },
        });
        if (!current) throw new NotFoundError("Company location");
        const willBeDefault = input.isDefault ?? current.isDefault;
        const willBeActive = input.isActive ?? current.isActive;
        if (current.isDefault && input.isDefault === false) {
          throw new ValidationError("Pick another location as the default instead.", [
            { path: "isDefault", message: "A company always has a default location" },
          ]);
        }
        if (willBeDefault && !willBeActive) {
          throw new ValidationError("The default location cannot be deactivated.", [
            { path: "isActive", message: "Set another default first" },
          ]);
        }
        if (input.isDefault && !current.isDefault) await this.clearDefault(ctx, companyId, tx);
        const data: Prisma.CompanyLocationUncheckedUpdateInput = {};
        if (input.name !== undefined) data.name = input.name;
        if (input.externalId !== undefined) data.externalId = input.externalId;
        if (input.phone !== undefined) data.phone = input.phone;
        if (input.email !== undefined) data.email = input.email;
        if (input.shippingAddress !== undefined) data.shippingAddress = json(input.shippingAddress);
        if (input.billingAddress !== undefined) {
          data.billingAddress = input.billingAddress ? json(input.billingAddress) : Prisma.DbNull;
        }
        if (input.currency !== undefined) data.currency = input.currency;
        if (input.taxExempt !== undefined) data.taxExempt = input.taxExempt;
        if (input.taxNumber !== undefined) data.taxNumber = input.taxNumber;
        if (input.isDefault !== undefined) data.isDefault = input.isDefault;
        if (input.isActive !== undefined) data.isActive = input.isActive;
        if (input.note !== undefined) data.note = input.note;
        await tx.companyLocation.update({ where: { id }, data });
        await this.audit.record(
          {
            organizationId: ctx.organizationId,
            storeId: ctx.storeId,
            actorId: ctx.actor.id,
            action: "company.location.updated",
            resourceType: "company",
            resourceId: companyId,
            before: { locationId: id, name: current.name, isDefault: current.isDefault },
            after: { locationId: id, name: input.name ?? current.name, isDefault: willBeDefault },
            meta,
          },
          tx,
        );
        await this.events.publish(
          ctx,
          "company.location.updated",
          { companyId, locationId: id },
          tx,
        );
      })
      .catch((error: unknown) => this.rethrowUnique(error));
    return this.get(ctx, companyId, id);
  }

  async remove(ctx: TenantContext, companyId: string, id: string, meta: RequestMeta) {
    await this.prisma.$transaction(async (tx) => {
      await this.companies.require(ctx, companyId, tx);
      const current = await tx.companyLocation.findFirst({
        where: { ...this.scope(ctx, companyId), id },
      });
      if (!current) throw new NotFoundError("Company location");
      const others = await tx.companyLocation.count({
        where: { ...this.scope(ctx, companyId), id: { not: id } },
      });
      if (current.isDefault && others > 0) {
        throw new ValidationError("Make another location the default before deleting this one.");
      }
      await tx.companyLocation.delete({ where: { id } });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "company.location.deleted",
          resourceType: "company",
          resourceId: companyId,
          before: { locationId: id, name: current.name },
          meta,
        },
        tx,
      );
      await this.events.publish(
        ctx,
        "company.location.deleted",
        { companyId, locationId: id },
        tx,
      );
    });
  }

  private countAllLocationUsers(companyId: string) {
    return this.prisma.companyUser.count({
      where: { companyId, status: "active", allLocations: true, customer: { deletedAt: null } },
    });
  }

  private clearDefault(ctx: TenantContext, companyId: string, tx: Prisma.TransactionClient) {
    return tx.companyLocation.updateMany({
      where: { ...this.scope(ctx, companyId), isDefault: true },
      data: { isDefault: false },
    });
  }

  private rethrowUnique(error: unknown): never {
    if (isUniqueViolation(error)) {
      throw new ConflictError("This company already has a location with that name.", [
        { path: "name", message: "Already taken" },
      ]);
    }
    throw error;
  }
}
