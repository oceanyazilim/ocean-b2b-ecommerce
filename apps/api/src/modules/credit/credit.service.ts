import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type {
  AdjustCreditInput,
  CreateCreditAccountInput,
  CreditAccountDetail,
  CreditAccountSummary,
  UpdateCreditAccountInput,
} from "@ocean/types";

import { ConflictError, NotFoundError, ValidationError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { toMoney } from "../catalog/money";
import { EventsService } from "../events/events.service";

const include = { ledgerEntries: { orderBy: { createdAt: "desc" as const }, take: 50 } };
type AccountRow = Prisma.CreditAccountGetPayload<{ include: typeof include }>;

// A credit account is a spending limit on a company or one of its locations. `used` only ever
// moves through recordUsage (ledger-backed, atomic); nothing else may write it directly so the
// ledger and the balance can never drift apart.
@Injectable()
export class CreditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  private toSummary(row: AccountRow): CreditAccountSummary {
    const limit = Number(row.limit);
    const used = Number(row.used);
    return {
      id: row.id,
      companyId: row.companyId,
      companyLocationId: row.companyLocationId,
      limit: toMoney(limit, row.currency),
      used: toMoney(used, row.currency),
      available: toMoney(Math.max(0, limit - used), row.currency),
      onExceedPolicy: row.onExceedPolicy,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toDetail(row: AccountRow): CreditAccountDetail {
    return {
      ...this.toSummary(row),
      ledger: row.ledgerEntries.map((l) => ({
        id: l.id,
        delta: toMoney(l.delta, row.currency),
        referenceType: l.referenceType,
        referenceId: l.referenceId,
        createdAt: l.createdAt.toISOString(),
      })),
    };
  }

  private async requireInStore(ctx: TenantContext, id: string): Promise<AccountRow> {
    const storeId = ctx.storeId as string;
    const row = await this.prisma.creditAccount.findFirst({
      where: {
        id,
        OR: [{ company: { storeId } }, { companyLocation: { storeId } }],
      },
      include,
    });
    if (!row) throw new NotFoundError("Credit account");
    return row;
  }

  async list(ctx: TenantContext): Promise<CreditAccountSummary[]> {
    const storeId = ctx.storeId as string;
    const rows = await this.prisma.creditAccount.findMany({
      where: { OR: [{ company: { storeId } }, { companyLocation: { storeId } }] },
      include,
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => this.toSummary(r));
  }

  async get(ctx: TenantContext, id: string): Promise<CreditAccountDetail> {
    return this.toDetail(await this.requireInStore(ctx, id));
  }

  async create(
    ctx: TenantContext,
    input: CreateCreditAccountInput,
    meta: RequestMeta,
  ): Promise<CreditAccountDetail> {
    const storeId = ctx.storeId as string;
    if (input.companyId) {
      const company = await this.prisma.company.findFirst({ where: { id: input.companyId, storeId } });
      if (!company) {
        throw new ValidationError("That company is not in this store.", [
          { path: "companyId", message: "Unknown company" },
        ]);
      }
    }
    if (input.companyLocationId) {
      const location = await this.prisma.companyLocation.findFirst({
        where: { id: input.companyLocationId, storeId },
      });
      if (!location) {
        throw new ValidationError("That company location is not in this store.", [
          { path: "companyLocationId", message: "Unknown location" },
        ]);
      }
    }
    const created = await this.prisma.creditAccount.create({
      data: {
        companyId: input.companyId ?? null,
        companyLocationId: input.companyLocationId ?? null,
        limit: BigInt(input.limit),
        used: 0n,
        currency: input.currency,
        onExceedPolicy: input.onExceedPolicy,
      },
      include,
    });
    await this.audit.record({
      organizationId: ctx.organizationId,
      storeId,
      actorId: ctx.actor.id,
      action: "credit.account_created",
      resourceType: "credit_account",
      resourceId: created.id,
      after: { companyId: created.companyId, limit: input.limit },
      meta,
    });
    await this.events.publish(ctx, "credit.account.created", { accountId: created.id });
    return this.toDetail(created);
  }

  async update(
    ctx: TenantContext,
    id: string,
    input: UpdateCreditAccountInput,
    meta: RequestMeta,
  ): Promise<CreditAccountDetail> {
    await this.requireInStore(ctx, id);
    const updated = await this.prisma.creditAccount.update({
      where: { id },
      data: {
        ...(input.limit !== undefined ? { limit: BigInt(input.limit) } : {}),
        ...(input.onExceedPolicy !== undefined ? { onExceedPolicy: input.onExceedPolicy } : {}),
      },
      include,
    });
    await this.audit.record({
      organizationId: ctx.organizationId,
      storeId: ctx.storeId,
      actorId: ctx.actor.id,
      action: "credit.account_updated",
      resourceType: "credit_account",
      resourceId: id,
      after: input,
      meta,
    });
    return this.toDetail(updated);
  }

  // Manual correction by finance staff (e.g. a write-off). Automatic usage from orders/refunds
  // should call recordUsage directly instead of going through this endpoint.
  async adjust(
    ctx: TenantContext,
    id: string,
    input: AdjustCreditInput,
    meta: RequestMeta,
  ): Promise<CreditAccountDetail> {
    const account = await this.recordUsage(ctx, id, input.delta, "manual_adjustment", ctx.actor.id);
    await this.audit.record({
      organizationId: ctx.organizationId,
      storeId: ctx.storeId,
      actorId: ctx.actor.id,
      action: "credit.adjusted",
      resourceType: "credit_account",
      resourceId: id,
      after: { delta: input.delta, note: input.note },
      meta,
    });
    return account;
  }

  // Core primitive: every change to `used` goes through here so it always has a matching ledger
  // row. A positive delta increases usage (an order/invoice charged against the limit); negative
  // reduces it (a payment or refund). Enforces onExceedPolicy "reject" against the new balance.
  async recordUsage(
    ctx: TenantContext,
    id: string,
    delta: number,
    referenceType: string,
    referenceId: string,
  ): Promise<CreditAccountDetail> {
    const row = await this.requireInStore(ctx, id);
    const nextUsed = Number(row.used) + delta;
    if (delta > 0 && row.onExceedPolicy === "reject" && nextUsed > Number(row.limit)) {
      throw new ConflictError(
        `This would exceed the credit limit (${toMoney(Number(row.limit), row.currency).amount / 100} ${row.currency}).`,
      );
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.creditAccount.update({
        where: { id },
        data: { used: { increment: BigInt(delta) } },
      });
      await tx.creditLedger.create({
        data: { creditAccountId: id, delta: BigInt(delta), referenceType, referenceId },
      });
      // Re-read with the fresh ledger row included — the update above ran before it existed.
      return tx.creditAccount.findUniqueOrThrow({ where: { id }, include });
    });
    return this.toDetail(updated);
  }

  // Read-only check other modules (quote conversion, invoicing) can call before committing to a
  // charge, without writing a ledger entry.
  async checkLimit(companyId: string, amount: number): Promise<{ ok: boolean; policy: string }> {
    const account = await this.prisma.creditAccount.findFirst({ where: { companyId } });
    if (!account) return { ok: true, policy: "none" };
    const would = Number(account.used) + amount;
    const ok = would <= Number(account.limit) || account.onExceedPolicy !== "reject";
    return { ok, policy: account.onExceedPolicy };
  }
}
