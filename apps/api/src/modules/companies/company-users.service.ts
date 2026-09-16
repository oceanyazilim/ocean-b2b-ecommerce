import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type { AddCompanyUserInput, CompanyUserSummary, UpdateCompanyUserInput } from "@ocean/types";

import { ConflictError, NotFoundError, ValidationError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import { isUniqueViolation } from "../../common/prisma-errors";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CustomersService } from "../customers/customers.service";
import { EventsService } from "../events/events.service";
import { companyUserInclude, toCompanyUserSummary } from "./company.mapper";
import { CompaniesService } from "./companies.service";

@Injectable()
export class CompanyUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService,
    private readonly customers: CustomersService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  private scope(ctx: TenantContext, companyId: string): Prisma.CompanyUserWhereInput {
    return {
      storeId: ctx.storeId as string,
      organizationId: ctx.organizationId,
      companyId,
      customer: { deletedAt: null },
    };
  }

  async list(ctx: TenantContext, companyId: string): Promise<CompanyUserSummary[]> {
    await this.companies.require(ctx, companyId);
    const rows = await this.prisma.companyUser.findMany({
      where: this.scope(ctx, companyId),
      include: companyUserInclude,
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(toCompanyUserSummary);
  }

  async get(ctx: TenantContext, companyId: string, id: string): Promise<CompanyUserSummary> {
    const row = await this.prisma.companyUser.findFirst({
      where: { ...this.scope(ctx, companyId), id },
      include: companyUserInclude,
    });
    if (!row) throw new NotFoundError("Company user");
    return toCompanyUserSummary(row);
  }

  async add(
    ctx: TenantContext,
    companyId: string,
    input: AddCompanyUserInput,
    meta: RequestMeta,
  ): Promise<CompanyUserSummary> {
    const id = await this.prisma
      .$transaction(async (tx) => {
        await this.companies.require(ctx, companyId, tx);
        const customerId = await this.resolveCustomer(ctx, input, meta, tx);
        const locationIds = input.allLocations
          ? []
          : await this.assertLocations(ctx, companyId, input.locationIds, tx);
        const created = await tx.companyUser.create({
          data: {
            companyId,
            customerId,
            storeId: ctx.storeId as string,
            organizationId: ctx.organizationId,
            role: input.role,
            title: input.title ?? null,
            allLocations: input.allLocations,
            locations: { create: locationIds.map((companyLocationId) => ({ companyLocationId })) },
          },
        });
        await this.audit.record(
          {
            organizationId: ctx.organizationId,
            storeId: ctx.storeId,
            actorId: ctx.actor.id,
            action: "company.user.added",
            resourceType: "company",
            resourceId: companyId,
            after: { companyUserId: created.id, customerId, role: input.role },
            meta,
          },
          tx,
        );
        await this.events.publish(
          ctx,
          "company.user.added",
          { companyId, customerId, companyUserId: created.id, role: input.role },
          tx,
        );
        return created.id;
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError("This customer is already a member of the company.", [
            { path: "customerId", message: "Already a member" },
          ]);
        }
        throw error;
      });
    return this.get(ctx, companyId, id);
  }

  async update(
    ctx: TenantContext,
    companyId: string,
    id: string,
    input: UpdateCompanyUserInput,
    meta: RequestMeta,
  ): Promise<CompanyUserSummary> {
    await this.prisma.$transaction(async (tx) => {
      await this.companies.require(ctx, companyId, tx);
      const current = await tx.companyUser.findFirst({
        where: { ...this.scope(ctx, companyId), id },
        include: { locations: true },
      });
      if (!current) throw new NotFoundError("Company user");
      const allLocations = input.allLocations ?? current.allLocations;
      const data: Prisma.CompanyUserUncheckedUpdateInput = {};
      if (input.role !== undefined) data.role = input.role;
      if (input.status !== undefined) data.status = input.status;
      if (input.title !== undefined) data.title = input.title;
      if (input.allLocations !== undefined) data.allLocations = input.allLocations;
      if (allLocations) {
        await tx.companyUserLocation.deleteMany({ where: { companyUserId: id } });
      } else if (input.locationIds !== undefined || input.allLocations === false) {
        const wanted = input.locationIds ?? current.locations.map((l) => l.companyLocationId);
        if (wanted.length === 0) {
          throw new ValidationError("Choose at least one location or allow all locations.", [
            { path: "locationIds", message: "Required when not all locations" },
          ]);
        }
        const locationIds = await this.assertLocations(ctx, companyId, wanted, tx);
        await tx.companyUserLocation.deleteMany({ where: { companyUserId: id } });
        await tx.companyUserLocation.createMany({
          data: locationIds.map((companyLocationId) => ({ companyUserId: id, companyLocationId })),
        });
      }
      await tx.companyUser.update({ where: { id }, data });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "company.user.updated",
          resourceType: "company",
          resourceId: companyId,
          before: { companyUserId: id, role: current.role, status: current.status },
          after: {
            companyUserId: id,
            role: input.role ?? current.role,
            status: input.status ?? current.status,
          },
          meta,
        },
        tx,
      );
      await this.events.publish(
        ctx,
        "company.user.updated",
        { companyId, companyUserId: id, customerId: current.customerId },
        tx,
      );
    });
    return this.get(ctx, companyId, id);
  }

  async remove(ctx: TenantContext, companyId: string, id: string, meta: RequestMeta) {
    await this.prisma.$transaction(async (tx) => {
      await this.companies.require(ctx, companyId, tx);
      const current = await tx.companyUser.findFirst({
        where: { ...this.scope(ctx, companyId), id },
      });
      if (!current) throw new NotFoundError("Company user");
      await tx.companyUser.delete({ where: { id } });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "company.user.removed",
          resourceType: "company",
          resourceId: companyId,
          before: { companyUserId: id, customerId: current.customerId, role: current.role },
          meta,
        },
        tx,
      );
      await this.events.publish(
        ctx,
        "company.user.removed",
        { companyId, companyUserId: id, customerId: current.customerId },
        tx,
      );
    });
  }

  private async resolveCustomer(
    ctx: TenantContext,
    input: AddCompanyUserInput,
    meta: RequestMeta,
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    if (input.customerId) {
      const row = await tx.customer.findFirst({
        where: { ...this.customers.scope(ctx), id: input.customerId },
        select: { id: true },
      });
      if (!row) {
        throw new ValidationError("That customer is not in this store.", [
          { path: "customerId", message: "Unknown customer" },
        ]);
      }
      return row.id;
    }
    const { id } = await this.customers.findOrCreateByEmail(
      ctx,
      { email: input.email as string, firstName: input.firstName, lastName: input.lastName },
      meta,
      tx,
    );
    return id;
  }

  private async assertLocations(
    ctx: TenantContext,
    companyId: string,
    ids: string[],
    tx: Prisma.TransactionClient,
  ): Promise<string[]> {
    const unique = [...new Set(ids)];
    const rows = await tx.companyLocation.findMany({
      where: {
        storeId: ctx.storeId as string,
        organizationId: ctx.organizationId,
        companyId,
        id: { in: unique },
      },
      select: { id: true },
    });
    if (rows.length !== unique.length) {
      throw new ValidationError("One or more locations do not belong to this company.", [
        { path: "locationIds", message: "Unknown location" },
      ]);
    }
    return rows.map((r) => r.id);
  }
}
