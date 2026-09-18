import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type {
  PaymentMethodInput,
  PaymentMethodSummary,
  UpdatePaymentMethodInput,
} from "@ocean/types";

import { ConflictError, NotFoundError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { EventsService } from "../events/events.service";

type MethodRow = Prisma.PaymentMethodGetPayload<Record<string, never>>;

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";

@Injectable()
export class PaymentMethodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  private scope(ctx: TenantContext): Prisma.PaymentMethodWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId };
  }

  toSummary(row: MethodRow): PaymentMethodSummary {
    return {
      id: row.id,
      provider: row.provider as PaymentMethodSummary["provider"],
      name: row.name,
      instructions: row.instructions,
      isEnabled: row.isEnabled,
      position: row.position,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async list(ctx: TenantContext): Promise<PaymentMethodSummary[]> {
    const rows = await this.prisma.paymentMethod.findMany({
      where: this.scope(ctx),
      orderBy: [{ position: "asc" }, { name: "asc" }],
    });
    return rows.map((r) => this.toSummary(r));
  }

  async get(ctx: TenantContext, id: string): Promise<PaymentMethodSummary> {
    const row = await this.prisma.paymentMethod.findFirst({ where: { ...this.scope(ctx), id } });
    if (!row) throw new NotFoundError("Payment method");
    return this.toSummary(row);
  }

  async create(
    ctx: TenantContext,
    input: PaymentMethodInput,
    meta: RequestMeta,
  ): Promise<PaymentMethodSummary> {
    const created = await this.prisma.paymentMethod
      .create({
        data: {
          storeId: ctx.storeId as string,
          organizationId: ctx.organizationId,
          provider: input.provider,
          name: input.name,
          instructions: input.instructions ?? null,
          config: input.config as Prisma.InputJsonValue,
          isEnabled: input.isEnabled,
          position: input.position,
        },
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError("A payment method with this name already exists.");
        }
        throw error;
      });
    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "payments.method_created",
        resourceType: "payment_method",
        resourceId: created.id,
        after: { provider: created.provider, name: created.name },
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "payments.method.created", { methodId: created.id });
    return this.toSummary(created);
  }

  async update(
    ctx: TenantContext,
    id: string,
    input: UpdatePaymentMethodInput,
    meta: RequestMeta,
  ): Promise<PaymentMethodSummary> {
    const current = await this.prisma.paymentMethod.findFirst({ where: { ...this.scope(ctx), id } });
    if (!current) throw new NotFoundError("Payment method");
    const data: Prisma.PaymentMethodUncheckedUpdateInput = {};
    if (input.provider !== undefined) data.provider = input.provider;
    if (input.name !== undefined) data.name = input.name;
    if (input.instructions !== undefined) data.instructions = input.instructions;
    if (input.config !== undefined) data.config = input.config as Prisma.InputJsonValue;
    if (input.isEnabled !== undefined) data.isEnabled = input.isEnabled;
    if (input.position !== undefined) data.position = input.position;
    const updated = await this.prisma.paymentMethod
      .update({ where: { id }, data })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError("A payment method with this name already exists.");
        }
        throw error;
      });
    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "payments.method_updated",
        resourceType: "payment_method",
        resourceId: id,
        before: { name: current.name },
        after: input,
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "payments.method.updated", { methodId: id });
    return this.toSummary(updated);
  }

  async remove(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    const current = await this.prisma.paymentMethod.findFirst({ where: { ...this.scope(ctx), id } });
    if (!current) throw new NotFoundError("Payment method");
    await this.prisma.paymentMethod.delete({ where: { id } });
    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "payments.method_deleted",
        resourceType: "payment_method",
        resourceId: id,
        before: { name: current.name },
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "payments.method.deleted", { methodId: id });
  }
}
