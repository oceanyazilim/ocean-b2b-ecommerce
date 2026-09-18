import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type {
  ApprovalListQuery,
  ApprovalRuleInput,
  ApprovalRuleSummary,
  ApprovalSummary,
  DecideApprovalInput,
  Paginated,
  UpdateApprovalRuleInput,
} from "@ocean/types";

import { ConflictError, NotFoundError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { EventsService } from "../events/events.service";
import { InventoryReservationsService } from "../inventory/inventory-reservations.service";

const approvalInclude = {
  order: { select: { id: true, name: true } },
  decidedBy: { select: { id: true, name: true } },
} satisfies Prisma.ApprovalInclude;
type ApprovalRow = Prisma.ApprovalGetPayload<{ include: typeof approvalInclude }>;

// Rules gate an order at placement time (see OrderPlacementService.place, which calls
// findMatchingRule before writing the order): a matching rule leaves the order
// "pending_approval" instead of "confirmed" and creates one Approval here. Approving flips the
// order back to confirmed; rejecting cancels it and releases its stock, same as a normal cancel.
@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reservations: InventoryReservationsService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  private scope(ctx: TenantContext): Prisma.ApprovalRuleWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId };
  }

  private toRuleSummary(row: Prisma.ApprovalRuleGetPayload<Record<string, never>>): ApprovalRuleSummary {
    return {
      id: row.id,
      companyId: row.companyId,
      conditions: (row.conditions as ApprovalRuleSummary["conditions"]) ?? {},
      approverRoles: row.approverRoles,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toApprovalSummary(row: ApprovalRow): ApprovalSummary {
    return {
      id: row.id,
      status: row.status,
      ruleId: row.ruleId,
      orderId: row.order?.id ?? null,
      orderName: row.order?.name ?? null,
      decidedBy: row.decidedBy,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
    };
  }

  // ---- rules --------------------------------------------------------------------------------

  async listRules(ctx: TenantContext): Promise<ApprovalRuleSummary[]> {
    const rows = await this.prisma.approvalRule.findMany({
      where: this.scope(ctx),
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => this.toRuleSummary(r));
  }

  async createRule(
    ctx: TenantContext,
    input: ApprovalRuleInput,
    meta: RequestMeta,
  ): Promise<ApprovalRuleSummary> {
    const created = await this.prisma.approvalRule.create({
      data: {
        storeId: ctx.storeId as string,
        organizationId: ctx.organizationId,
        companyId: input.companyId ?? null,
        conditions: input.conditions as Prisma.InputJsonValue,
        approverRoles: input.approverRoles,
      },
    });
    await this.audit.record({
      organizationId: ctx.organizationId,
      storeId: ctx.storeId,
      actorId: ctx.actor.id,
      action: "approval_rule.created",
      resourceType: "approval_rule",
      resourceId: created.id,
      after: { companyId: created.companyId, conditions: input.conditions },
      meta,
    });
    await this.events.publish(ctx, "approval_rule.created", { ruleId: created.id });
    return this.toRuleSummary(created);
  }

  async updateRule(
    ctx: TenantContext,
    id: string,
    input: UpdateApprovalRuleInput,
    meta: RequestMeta,
  ): Promise<ApprovalRuleSummary> {
    const current = await this.prisma.approvalRule.findFirst({ where: { ...this.scope(ctx), id } });
    if (!current) throw new NotFoundError("Approval rule");
    const updated = await this.prisma.approvalRule.update({
      where: { id },
      data: {
        ...(input.companyId !== undefined ? { companyId: input.companyId } : {}),
        ...(input.conditions !== undefined ? { conditions: input.conditions as Prisma.InputJsonValue } : {}),
        ...(input.approverRoles !== undefined ? { approverRoles: input.approverRoles } : {}),
      },
    });
    await this.audit.record({
      organizationId: ctx.organizationId,
      storeId: ctx.storeId,
      actorId: ctx.actor.id,
      action: "approval_rule.updated",
      resourceType: "approval_rule",
      resourceId: id,
      meta,
    });
    return this.toRuleSummary(updated);
  }

  async removeRule(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    const current = await this.prisma.approvalRule.findFirst({ where: { ...this.scope(ctx), id } });
    if (!current) throw new NotFoundError("Approval rule");
    await this.prisma.approvalRule.delete({ where: { id } });
    await this.audit.record({
      organizationId: ctx.organizationId,
      storeId: ctx.storeId,
      actorId: ctx.actor.id,
      action: "approval_rule.deleted",
      resourceType: "approval_rule",
      resourceId: id,
      meta,
    });
  }

  // Read-only: the most specific active rule (company-scoped beats store-wide) whose
  // conditions.minTotal is met. Called by OrderPlacementService before it writes the order.
  async findMatchingRule(
    ctx: TenantContext,
    companyId: string | null,
    totalAmount: number,
  ): Promise<{ id: string } | null> {
    if (!companyId) return null;
    const rules = await this.prisma.approvalRule.findMany({
      where: { storeId: ctx.storeId as string, OR: [{ companyId }, { companyId: null }] },
    });
    const specific = rules.find((r) => r.companyId === companyId);
    const rule = specific ?? rules.find((r) => r.companyId === null);
    if (!rule) return null;
    const conditions = (rule.conditions as { minTotal?: number } | null) ?? {};
    if (conditions.minTotal !== undefined && totalAmount < conditions.minTotal) return null;
    return { id: rule.id };
  }

  // ---- approval instances ---------------------------------------------------------------------

  async list(ctx: TenantContext, query: ApprovalListQuery): Promise<Paginated<ApprovalSummary>> {
    const where: Prisma.ApprovalWhereInput = {
      storeId: ctx.storeId as string,
      organizationId: ctx.organizationId,
      ...(query.status ? { status: query.status } : {}),
    };
    const rows = await this.prisma.approval.findMany({
      where,
      include: approvalInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    return {
      data: page.map((r) => this.toApprovalSummary(r)),
      pageInfo: { hasNextPage, endCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null },
    };
  }

  async get(ctx: TenantContext, id: string): Promise<ApprovalSummary> {
    const row = await this.prisma.approval.findFirst({
      where: { id, storeId: ctx.storeId as string, organizationId: ctx.organizationId },
      include: approvalInclude,
    });
    if (!row) throw new NotFoundError("Approval");
    return this.toApprovalSummary(row);
  }

  async approve(
    ctx: TenantContext,
    id: string,
    input: DecideApprovalInput,
    meta: RequestMeta,
  ): Promise<ApprovalSummary> {
    const storeId = ctx.storeId as string;
    await this.prisma.$transaction(async (tx) => {
      const approval = await tx.approval.findFirst({ where: { id, storeId, organizationId: ctx.organizationId } });
      if (!approval) throw new NotFoundError("Approval");
      if (approval.status !== "pending") throw new ConflictError("This approval was already decided.");
      await tx.approval.update({
        where: { id },
        data: { status: "approved", decidedById: ctx.actor.id, decidedAt: new Date(), note: input.note ?? null },
      });
      if (approval.orderId) {
        await tx.order.update({
          where: { id: approval.orderId },
          data: { status: "confirmed" },
        });
        await tx.orderEvent.create({
          data: {
            orderId: approval.orderId,
            storeId,
            type: "order.approved",
            actorType: ctx.actor.type,
            actorId: ctx.actor.id,
          },
        });
      }
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId,
          actorId: ctx.actor.id,
          action: "approval.approved",
          resourceType: "approval",
          resourceId: id,
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "approval.approved", { approvalId: id, orderId: approval.orderId }, tx);
    });
    return this.get(ctx, id);
  }

  async reject(
    ctx: TenantContext,
    id: string,
    input: DecideApprovalInput,
    meta: RequestMeta,
  ): Promise<ApprovalSummary> {
    const storeId = ctx.storeId as string;
    await this.prisma.$transaction(async (tx) => {
      const approval = await tx.approval.findFirst({ where: { id, storeId, organizationId: ctx.organizationId } });
      if (!approval) throw new NotFoundError("Approval");
      if (approval.status !== "pending") throw new ConflictError("This approval was already decided.");
      await tx.approval.update({
        where: { id },
        data: { status: "rejected", decidedById: ctx.actor.id, decidedAt: new Date(), note: input.note ?? null },
      });
      if (approval.orderId) {
        const order = await tx.order.findUniqueOrThrow({
          where: { id: approval.orderId },
          include: { items: { include: { reservations: { where: { releasedAt: null } } } } },
        });
        if (order.status === "pending_approval") {
          const holds = order.items.flatMap((i) => i.reservations);
          if (holds.length) {
            await this.reservations.release(
              ctx,
              holds.map((h) => ({
                inventoryItemId: h.inventoryItemId,
                locationId: h.locationId,
                quantity: h.quantity,
              })),
              tx,
            );
            await tx.orderItemReservation.updateMany({
              where: { id: { in: holds.map((h) => h.id) } },
              data: { releasedAt: new Date() },
            });
          }
          await tx.order.update({
            where: { id: approval.orderId },
            data: {
              status: "cancelled",
              cancelledAt: new Date(),
              cancelReason: input.note ?? "Approval rejected",
              closedAt: new Date(),
            },
          });
          if (order.customerId) {
            await tx.customer.update({
              where: { id: order.customerId },
              data: { ordersCount: { decrement: 1 }, totalSpent: { decrement: order.total } },
            });
          }
          await tx.orderEvent.create({
            data: {
              orderId: approval.orderId,
              storeId,
              type: "order.cancelled",
              payload: { reason: "approval_rejected" },
              actorType: ctx.actor.type,
              actorId: ctx.actor.id,
            },
          });
        }
      }
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId,
          actorId: ctx.actor.id,
          action: "approval.rejected",
          resourceType: "approval",
          resourceId: id,
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "approval.rejected", { approvalId: id, orderId: approval.orderId }, tx);
    });
    return this.get(ctx, id);
  }
}
