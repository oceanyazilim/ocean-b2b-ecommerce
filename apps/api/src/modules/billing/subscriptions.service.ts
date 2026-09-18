import { Injectable } from "@nestjs/common";
import type { Prisma, Subscription } from "@ocean/db";
import type { ChangePlanInput, PlanPrices, PlatformInvoiceSummary, SubscriptionDetail } from "@ocean/types";

import { NotFoundError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { toMoney } from "../catalog/money";
import { toPlanSummary } from "./plans.service";

const TRIAL_MS = 14 * 24 * 60 * 60 * 1000;
const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // Every organization gets a subscription lazily, on first read — no payment ever changes
  // hands here (there's no PSP wired up for platform billing, same honest gap as everywhere
  // else in this codebase), it's just the trial-on-Starter default every SaaS needs.
  async getOrCreateForOrganization(
    organizationId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<Subscription> {
    const existing = await tx.subscription.findUnique({ where: { organizationId } });
    if (existing) return existing;
    const starter = await tx.plan.findUniqueOrThrow({ where: { code: "starter" } });
    const now = new Date();
    return tx.subscription.create({
      data: {
        organizationId,
        planId: starter.id,
        status: "trialing",
        trialEndsAt: new Date(now.getTime() + TRIAL_MS),
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + PERIOD_MS),
      },
    });
  }

  async getDetail(tenant: TenantContext): Promise<SubscriptionDetail> {
    const sub = await this.getOrCreateForOrganization(tenant.organizationId);
    return this.toDetail(tenant.organizationId, sub);
  }

  async changePlan(
    tenant: TenantContext,
    input: ChangePlanInput,
    meta: RequestMeta,
  ): Promise<SubscriptionDetail> {
    const plan = await this.prisma.plan.findUnique({ where: { id: input.planId } });
    if (!plan || plan.status !== "active") throw new NotFoundError("Plan");
    const sub = await this.getOrCreateForOrganization(tenant.organizationId);
    const updated = await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { planId: plan.id, status: "active", cancelAt: null, canceledAt: null },
    });
    await this.audit.record({
      organizationId: tenant.organizationId,
      actorId: tenant.actor.id,
      action: "subscription.plan_changed",
      resourceType: "subscription",
      resourceId: updated.id,
      before: { planId: sub.planId },
      after: { planId: plan.id },
      meta,
    });

    // No PSP is wired up for platform billing (mirrors the honest gap everywhere else in this
    // codebase), so a paid plan change is invoiced and marked paid immediately rather than
    // pretending to collect payment.
    const prices = plan.prices as PlanPrices | null;
    const monthly = prices?.TRY?.monthly ?? 0;
    if (monthly > 0) {
      const now = new Date();
      await this.prisma.platformInvoice.create({
        data: {
          organizationId: tenant.organizationId,
          subscriptionId: updated.id,
          amount: BigInt(monthly),
          currency: "TRY",
          status: "paid",
          dueAt: now,
          paidAt: now,
        },
      });
    }

    return this.toDetail(tenant.organizationId, updated);
  }

  async listInvoices(organizationId: string): Promise<PlatformInvoiceSummary[]> {
    const rows = await this.prisma.platformInvoice.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      amount: toMoney(r.amount, r.currency),
      status: r.status,
      dueAt: r.dueAt.toISOString(),
      paidAt: r.paidAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // Immediate cancellation, not cancel-at-period-end — there's no scheduler in this codebase
  // to flip the status later, so promising a grace period would be decorative. Changing plan
  // again reactivates.
  async cancel(tenant: TenantContext, meta: RequestMeta): Promise<SubscriptionDetail> {
    const sub = await this.getOrCreateForOrganization(tenant.organizationId);
    const now = new Date();
    const updated = await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { status: "canceled", cancelAt: now, canceledAt: now },
    });
    await this.audit.record({
      organizationId: tenant.organizationId,
      actorId: tenant.actor.id,
      action: "subscription.canceled",
      resourceType: "subscription",
      resourceId: updated.id,
      before: { status: sub.status },
      after: { status: "canceled" },
      meta,
    });
    return this.toDetail(tenant.organizationId, updated);
  }

  private async toDetail(organizationId: string, sub: Subscription): Promise<SubscriptionDetail> {
    const [plan, storesUsed, staffUsed] = await Promise.all([
      this.prisma.plan.findUniqueOrThrow({
        where: { id: sub.planId },
        include: { entitlements: true },
      }),
      this.prisma.store.count({ where: { organizationId } }),
      this.prisma.organizationMember.count({ where: { organizationId, status: "active" } }),
    ]);
    const planSummary = toPlanSummary(plan);
    const storesMax = typeof planSummary.entitlements["stores.max"] === "number" ? (planSummary.entitlements["stores.max"] as number) : null;
    const staffMax = typeof planSummary.entitlements["staff.max"] === "number" ? (planSummary.entitlements["staff.max"] as number) : null;
    return {
      id: sub.id,
      status: sub.status,
      plan: planSummary,
      trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
      currentPeriodStart: sub.currentPeriodStart.toISOString(),
      currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
      cancelAt: sub.cancelAt?.toISOString() ?? null,
      canceledAt: sub.canceledAt?.toISOString() ?? null,
      usage: { storesUsed, storesMax, staffUsed, staffMax },
    };
  }
}
