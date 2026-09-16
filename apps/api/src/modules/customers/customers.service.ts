import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type {
  CreateCustomerInput,
  CustomerAddressInput,
  CustomerBulkAction,
  CustomerCandidate,
  CustomerDetail,
  CustomerListQuery,
  CustomerSearchQuery,
  CustomerStats,
  CustomerSummary,
  Paginated,
  UpdateCustomerAddressInput,
  UpdateCustomerInput,
} from "@ocean/types";

import { ConflictError, NotFoundError, ValidationError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import { isUniqueViolation } from "../../common/prisma-errors";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { EventsService } from "../events/events.service";
import {
  customerDetailInclude,
  customerDisplayName,
  customerSummaryInclude,
  toCustomerDetail,
  toCustomerSummary,
} from "./customer.mapper";

const SORT: Record<CustomerListQuery["sort"], Prisma.CustomerOrderByWithRelationInput[]> = {
  created_desc: [{ createdAt: "desc" }, { id: "desc" }],
  created_asc: [{ createdAt: "asc" }, { id: "asc" }],
  updated_desc: [{ updatedAt: "desc" }, { id: "desc" }],
  name_asc: [{ lastName: "asc" }, { firstName: "asc" }, { email: "asc" }, { id: "asc" }],
  name_desc: [{ lastName: "desc" }, { firstName: "desc" }, { email: "desc" }, { id: "desc" }],
  spent_desc: [{ totalSpent: "desc" }, { id: "desc" }],
};

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const normalizeTags = (tags: string[]) => [...new Set(tags.map((t) => t.trim()).filter(Boolean))];

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  scope(ctx: TenantContext): Prisma.CustomerWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId, deletedAt: null };
  }

  private async currency(ctx: TenantContext): Promise<string> {
    const store = await this.prisma.store.findUnique({
      where: { id: ctx.storeId as string },
      select: { defaultCurrency: true },
    });
    return store?.defaultCurrency ?? "TRY";
  }

  async list(ctx: TenantContext, query: CustomerListQuery): Promise<Paginated<CustomerSummary>> {
    const where: Prisma.CustomerWhereInput = {
      ...this.scope(ctx),
      ...(query.status ? { status: query.status } : {}),
      ...(query.tag ? { tags: { has: query.tag } } : {}),
      ...(query.companyId ? { companyUsers: { some: { companyId: query.companyId } } } : {}),
      ...(query.kind === "company_buyer"
        ? { companyUsers: { some: { status: "active", company: { deletedAt: null } } } }
        : query.kind === "individual"
          ? { companyUsers: { none: { status: "active", company: { deletedAt: null } } } }
          : {}),
      ...(query.q
        ? {
            OR: [
              { email: { contains: query.q, mode: "insensitive" } },
              { firstName: { contains: query.q, mode: "insensitive" } },
              { lastName: { contains: query.q, mode: "insensitive" } },
              { phone: { contains: query.q, mode: "insensitive" } },
              { tags: { has: query.q } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.customer.findMany({
      where,
      include: customerSummaryInclude,
      orderBy: SORT[query.sort],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    const currency = await this.currency(ctx);
    return {
      data: page.map((r) => toCustomerSummary(r, currency)),
      pageInfo: { hasNextPage, endCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null },
    };
  }

  async search(ctx: TenantContext, query: CustomerSearchQuery): Promise<CustomerCandidate[]> {
    const rows = await this.prisma.customer.findMany({
      where: {
        ...this.scope(ctx),
        ...(query.q
          ? {
              OR: [
                { email: { contains: query.q, mode: "insensitive" } },
                { firstName: { contains: query.q, mode: "insensitive" } },
                { lastName: { contains: query.q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { email: "asc" }],
      take: query.limit,
      select: { id: true, email: true, firstName: true, lastName: true, status: true },
    });
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      displayName: customerDisplayName(r),
      status: r.status,
    }));
  }

  async stats(ctx: TenantContext): Promise<CustomerStats> {
    const scope = this.scope(ctx);
    const [total, active, disabled, companyBuyers, subscribed] = await Promise.all([
      this.prisma.customer.count({ where: scope }),
      this.prisma.customer.count({ where: { ...scope, status: "active" } }),
      this.prisma.customer.count({ where: { ...scope, status: "disabled" } }),
      this.prisma.customer.count({
        where: {
          ...scope,
          companyUsers: { some: { status: "active", company: { deletedAt: null } } },
        },
      }),
      this.prisma.customer.count({ where: { ...scope, emailMarketing: "subscribed" } }),
    ]);
    return { total, active, disabled, companyBuyers, subscribed };
  }

  async get(ctx: TenantContext, id: string): Promise<CustomerDetail> {
    const row = await this.prisma.customer.findFirst({
      where: { ...this.scope(ctx), id },
      include: customerDetailInclude,
    });
    if (!row) throw new NotFoundError("Customer");
    return toCustomerDetail(row, await this.currency(ctx));
  }

  // Used by other modules (company users, applications) to find or create by email inside
  // their own transaction. Returns the live customer id.
  async findOrCreateByEmail(
    ctx: TenantContext,
    input: { email: string; firstName?: string | null; lastName?: string | null },
    meta: RequestMeta,
    tx: Prisma.TransactionClient,
  ): Promise<{ id: string; created: boolean }> {
    const existing = await tx.customer.findFirst({
      where: { ...this.scope(ctx), email: input.email },
      select: { id: true },
    });
    if (existing) return { id: existing.id, created: false };
    const created = await tx.customer.create({
      data: {
        storeId: ctx.storeId as string,
        organizationId: ctx.organizationId,
        email: input.email,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
      },
    });
    await this.recordCreated(ctx, created.id, created.email, meta, tx);
    return { id: created.id, created: true };
  }

  async create(
    ctx: TenantContext,
    input: CreateCustomerInput,
    meta: RequestMeta,
  ): Promise<CustomerDetail> {
    const id = await this.prisma
      .$transaction(async (tx) => {
        await this.assertEmailFree(ctx, input.email, null, tx);
        const created = await tx.customer.create({
          data: {
            storeId: ctx.storeId as string,
            organizationId: ctx.organizationId,
            email: input.email,
            firstName: input.firstName ?? null,
            lastName: input.lastName ?? null,
            phone: input.phone ?? null,
            status: input.status,
            tags: normalizeTags(input.tags),
            note: input.note ?? null,
            locale: input.locale ?? null,
            taxExempt: input.taxExempt,
            emailMarketing: input.emailMarketing,
            emailMarketingUpdatedAt: input.emailMarketing === "not_subscribed" ? null : new Date(),
          },
        });
        for (const [i, address] of (input.addresses ?? []).entries()) {
          await tx.customerAddress.create({
            data: {
              customerId: created.id,
              storeId: ctx.storeId as string,
              address: json(address),
              isDefaultShipping: i === 0,
              isDefaultBilling: i === 0,
            },
          });
        }
        await this.recordCreated(ctx, created.id, created.email, meta, tx);
        return created.id;
      })
      .catch((error: unknown) => this.rethrowUnique(error));
    return this.get(ctx, id);
  }

  async update(
    ctx: TenantContext,
    id: string,
    input: UpdateCustomerInput,
    meta: RequestMeta,
  ): Promise<CustomerDetail> {
    await this.prisma
      .$transaction(async (tx) => {
        const current = await tx.customer.findFirst({ where: { ...this.scope(ctx), id } });
        if (!current) throw new NotFoundError("Customer");
        if (current.version !== input.version) {
          throw new ConflictError(
            "This customer was changed by someone else. Reload to see the latest version.",
          );
        }
        if (input.email !== undefined && input.email !== current.email) {
          await this.assertEmailFree(ctx, input.email, id, tx);
        }
        const data: Prisma.CustomerUncheckedUpdateInput = { version: { increment: 1 } };
        if (input.email !== undefined) data.email = input.email;
        if (input.firstName !== undefined) data.firstName = input.firstName;
        if (input.lastName !== undefined) data.lastName = input.lastName;
        if (input.phone !== undefined) data.phone = input.phone;
        if (input.status !== undefined) data.status = input.status;
        if (input.tags !== undefined) data.tags = normalizeTags(input.tags);
        if (input.note !== undefined) data.note = input.note;
        if (input.locale !== undefined) data.locale = input.locale;
        if (input.taxExempt !== undefined) data.taxExempt = input.taxExempt;
        if (input.emailMarketing !== undefined && input.emailMarketing !== current.emailMarketing) {
          data.emailMarketing = input.emailMarketing;
          data.emailMarketingUpdatedAt = new Date();
        }
        await tx.customer.update({ where: { id }, data });
        await this.audit.record(
          {
            organizationId: ctx.organizationId,
            storeId: ctx.storeId,
            actorId: ctx.actor.id,
            action: "customer.updated",
            resourceType: "customer",
            resourceId: id,
            before: {
              email: current.email,
              status: current.status,
              taxExempt: current.taxExempt,
              emailMarketing: current.emailMarketing,
            },
            after: {
              email: input.email ?? current.email,
              status: input.status ?? current.status,
              taxExempt: input.taxExempt ?? current.taxExempt,
              emailMarketing: input.emailMarketing ?? current.emailMarketing,
            },
            meta,
          },
          tx,
        );
        await this.events.publish(ctx, "customer.updated", { customerId: id }, tx);
      })
      .catch((error: unknown) => this.rethrowUnique(error));
    return this.get(ctx, id);
  }

  async remove(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.customer.findFirst({ where: { ...this.scope(ctx), id } });
      if (!current) throw new NotFoundError("Customer");
      await this.softDelete(ctx, [current], meta, tx);
    });
  }

  async bulk(
    ctx: TenantContext,
    input: CustomerBulkAction,
    meta: RequestMeta,
  ): Promise<{ affected: number }> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.customer.findMany({
        where: { ...this.scope(ctx), id: { in: input.ids } },
      });
      if (rows.length === 0) return { affected: 0 };
      const ids = rows.map((r) => r.id);
      switch (input.action) {
        case "delete":
          await this.softDelete(ctx, rows, meta, tx);
          break;
        case "enable":
        case "disable": {
          const status = input.action === "enable" ? "active" : "disabled";
          await tx.customer.updateMany({
            where: { id: { in: ids } },
            data: { status, version: { increment: 1 } },
          });
          for (const row of rows) {
            await this.events.publish(ctx, "customer.updated", { customerId: row.id }, tx);
          }
          break;
        }
        case "add_tag":
        case "remove_tag": {
          const tag = input.tag as string;
          for (const row of rows) {
            const tags =
              input.action === "add_tag"
                ? normalizeTags([...row.tags, tag])
                : row.tags.filter((t) => t !== tag);
            await tx.customer.update({
              where: { id: row.id },
              data: { tags, version: { increment: 1 } },
            });
            await this.events.publish(ctx, "customer.updated", { customerId: row.id }, tx);
          }
          break;
        }
      }
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: `customer.bulk.${input.action}`,
          resourceType: "customer",
          metadata: { ids, tag: input.tag ?? null },
          meta,
        },
        tx,
      );
      return { affected: ids.length };
    });
  }

  // ---- addresses --------------------------------------------------------------------------------

  async addAddress(
    ctx: TenantContext,
    customerId: string,
    input: CustomerAddressInput,
    meta: RequestMeta,
  ): Promise<CustomerDetail> {
    await this.prisma.$transaction(async (tx) => {
      const customer = await this.requireCustomer(ctx, customerId, tx);
      const count = await tx.customerAddress.count({ where: { customerId } });
      if (count >= 20) throw new ValidationError("A customer can have at most 20 addresses.");
      // The first address becomes the default for both uses, whatever the form said.
      const isDefaultShipping = input.isDefaultShipping || count === 0;
      const isDefaultBilling = input.isDefaultBilling || count === 0;
      await this.clearDefaults(customerId, isDefaultShipping, isDefaultBilling, tx);
      const created = await tx.customerAddress.create({
        data: {
          customerId,
          storeId: ctx.storeId as string,
          address: json(input.address),
          isDefaultShipping,
          isDefaultBilling,
        },
      });
      await this.touch(customer.id, tx);
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "customer.address.added",
          resourceType: "customer",
          resourceId: customerId,
          after: { addressId: created.id, city: input.address.city },
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "customer.updated", { customerId }, tx);
    });
    return this.get(ctx, customerId);
  }

  async updateAddress(
    ctx: TenantContext,
    customerId: string,
    addressId: string,
    input: UpdateCustomerAddressInput,
    meta: RequestMeta,
  ): Promise<CustomerDetail> {
    await this.prisma.$transaction(async (tx) => {
      const customer = await this.requireCustomer(ctx, customerId, tx);
      const current = await tx.customerAddress.findFirst({
        where: { id: addressId, customerId, storeId: ctx.storeId as string },
      });
      if (!current) throw new NotFoundError("Address");
      if (current.isDefaultShipping && input.isDefaultShipping === false) {
        throw new ValidationError("Pick another address as the default shipping address instead.");
      }
      if (current.isDefaultBilling && input.isDefaultBilling === false) {
        throw new ValidationError("Pick another address as the default billing address instead.");
      }
      await this.clearDefaults(
        customerId,
        input.isDefaultShipping === true && !current.isDefaultShipping,
        input.isDefaultBilling === true && !current.isDefaultBilling,
        tx,
      );
      await tx.customerAddress.update({
        where: { id: addressId },
        data: {
          ...(input.address !== undefined ? { address: json(input.address) } : {}),
          ...(input.isDefaultShipping !== undefined
            ? { isDefaultShipping: input.isDefaultShipping }
            : {}),
          ...(input.isDefaultBilling !== undefined
            ? { isDefaultBilling: input.isDefaultBilling }
            : {}),
        },
      });
      await this.touch(customer.id, tx);
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "customer.address.updated",
          resourceType: "customer",
          resourceId: customerId,
          metadata: { addressId },
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "customer.updated", { customerId }, tx);
    });
    return this.get(ctx, customerId);
  }

  async removeAddress(
    ctx: TenantContext,
    customerId: string,
    addressId: string,
    meta: RequestMeta,
  ): Promise<CustomerDetail> {
    await this.prisma.$transaction(async (tx) => {
      const customer = await this.requireCustomer(ctx, customerId, tx);
      const current = await tx.customerAddress.findFirst({
        where: { id: addressId, customerId, storeId: ctx.storeId as string },
      });
      if (!current) throw new NotFoundError("Address");
      await tx.customerAddress.delete({ where: { id: addressId } });
      // Hand the default flags to the oldest remaining address so checkout always has one.
      if (current.isDefaultShipping || current.isDefaultBilling) {
        const next = await tx.customerAddress.findFirst({
          where: { customerId },
          orderBy: { createdAt: "asc" },
        });
        if (next) {
          await tx.customerAddress.update({
            where: { id: next.id },
            data: {
              ...(current.isDefaultShipping ? { isDefaultShipping: true } : {}),
              ...(current.isDefaultBilling ? { isDefaultBilling: true } : {}),
            },
          });
        }
      }
      await this.touch(customer.id, tx);
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "customer.address.removed",
          resourceType: "customer",
          resourceId: customerId,
          metadata: { addressId },
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "customer.updated", { customerId }, tx);
    });
    return this.get(ctx, customerId);
  }

  // ---- internals --------------------------------------------------------------------------------

  private async requireCustomer(ctx: TenantContext, id: string, tx: Prisma.TransactionClient) {
    const row = await tx.customer.findFirst({
      where: { ...this.scope(ctx), id },
      select: { id: true },
    });
    if (!row) throw new NotFoundError("Customer");
    return row;
  }

  private touch(id: string, tx: Prisma.TransactionClient) {
    return tx.customer.update({ where: { id }, data: { version: { increment: 1 } } });
  }

  private async clearDefaults(
    customerId: string,
    shipping: boolean,
    billing: boolean,
    tx: Prisma.TransactionClient,
  ) {
    if (shipping) {
      await tx.customerAddress.updateMany({
        where: { customerId, isDefaultShipping: true },
        data: { isDefaultShipping: false },
      });
    }
    if (billing) {
      await tx.customerAddress.updateMany({
        where: { customerId, isDefaultBilling: true },
        data: { isDefaultBilling: false },
      });
    }
  }

  private async assertEmailFree(
    ctx: TenantContext,
    email: string,
    excludeId: string | null,
    tx: Prisma.TransactionClient,
  ) {
    const clash = await tx.customer.findFirst({
      where: { ...this.scope(ctx), email, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictError("A customer with this email already exists.", [
        { path: "email", message: "Already in use" },
      ]);
    }
  }

  private rethrowUnique(error: unknown): never {
    if (isUniqueViolation(error)) {
      throw new ConflictError("A customer with this email already exists.", [
        { path: "email", message: "Already in use" },
      ]);
    }
    throw error;
  }

  private async recordCreated(
    ctx: TenantContext,
    id: string,
    email: string,
    meta: RequestMeta,
    tx: Prisma.TransactionClient,
  ) {
    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "customer.created",
        resourceType: "customer",
        resourceId: id,
        after: { email },
        meta,
      },
      tx,
    );
    await this.events.publish(ctx, "customer.created", { customerId: id }, tx);
  }

  private async softDelete(
    ctx: TenantContext,
    rows: { id: string; email: string }[],
    meta: RequestMeta,
    tx: Prisma.TransactionClient,
  ) {
    const ids = rows.map((r) => r.id);
    const now = new Date();
    // A deleted customer stops being a buyer anywhere; the row itself is kept for order history.
    await tx.companyUser.deleteMany({ where: { customerId: { in: ids } } });
    await tx.customer.updateMany({
      where: { id: { in: ids } },
      data: { deletedAt: now, status: "disabled", version: { increment: 1 } },
    });
    for (const row of rows) {
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "customer.deleted",
          resourceType: "customer",
          resourceId: row.id,
          before: { email: row.email },
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "customer.deleted", { customerId: row.id }, tx);
    }
  }
}
