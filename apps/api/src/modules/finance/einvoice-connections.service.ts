import { Injectable } from "@nestjs/common";
import type {
  EInvoiceConnectionSummary,
  EInvoiceProviderCategory,
  UpsertEInvoiceConnectionInput,
} from "@ocean/types";
import { E_INVOICE_PROVIDER_CATEGORIES } from "@ocean/types";

import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

// E-invoicing provider connections (spec section 29): a real provider-connection abstraction —
// category, status, connected-at — but deliberately never a real working integration. Same
// honesty precedent as Phase 7's ManualPaymentAdapter
// (apps/api/src/modules/payments/adapters/manual.adapter.ts): nothing here ever calls a real
// e-Fatura/government-tax-platform/accounting-platform API. `status` is always computed from
// whether the merchant has actually supplied an account identifier and a credential, never
// hand-set — so an unconfigured category honestly reads "Disconnected", a half-filled one "Action
// required", and "Connected" only once both are present. The credential's raw value itself is
// never persisted (see EInvoiceProviderConnection's schema.prisma comment) — there is nothing
// legitimate to keep it *for* without a real API to send it to.
@Injectable()
export class EInvoiceConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private toSummary(row: {
    id: string;
    category: EInvoiceProviderCategory;
    providerName: string;
    accountIdentifier: string | null;
    hasCredential: boolean;
    status: "disconnected" | "action_required" | "connected";
    statusDetail: string | null;
    connectedAt: Date | null;
    updatedAt: Date;
  }): EInvoiceConnectionSummary {
    return {
      id: row.id,
      category: row.category,
      providerName: row.providerName,
      accountIdentifier: row.accountIdentifier,
      hasCredential: row.hasCredential,
      status: row.status,
      statusDetail: row.statusDetail,
      connectedAt: row.connectedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // Every category is always listed, even ones the merchant has never touched — an unconfigured
  // category is real, honest information ("Disconnected"), not an absence to hide.
  async list(ctx: TenantContext): Promise<EInvoiceConnectionSummary[]> {
    const storeId = ctx.storeId as string;
    const rows = await this.prisma.eInvoiceProviderConnection.findMany({ where: { storeId } });
    const byCategory = new Map(rows.map((r) => [r.category, r]));
    return E_INVOICE_PROVIDER_CATEGORIES.map((category) => {
      const row = byCategory.get(category);
      if (row) return this.toSummary(row);
      return {
        id: `unconfigured:${category}`,
        category,
        providerName: "",
        accountIdentifier: null,
        hasCredential: false,
        status: "disconnected" as const,
        statusDetail: null,
        connectedAt: null,
        updatedAt: new Date(0).toISOString(),
      };
    });
  }

  async upsert(
    ctx: TenantContext,
    input: UpsertEInvoiceConnectionInput,
    meta: RequestMeta,
  ): Promise<EInvoiceConnectionSummary> {
    const storeId = ctx.storeId as string;
    const accountIdentifier = input.accountIdentifier?.trim() || null;
    // `credential` is write-only and never echoed back (see the model's schema.prisma comment),
    // so the admin UI omits it from the request entirely when the merchant leaves it blank on an
    // edit — that means "leave the existing credential state alone", not "clear it". Only an
    // explicitly-sent value (including an explicit null) changes hasCredential.
    let hasCredential: boolean;
    if (input.credential !== undefined) {
      hasCredential = Boolean(input.credential?.trim());
    } else {
      const existing = await this.prisma.eInvoiceProviderConnection.findUnique({
        where: { storeId_category: { storeId, category: input.category } },
        select: { hasCredential: true },
      });
      hasCredential = existing?.hasCredential ?? false;
    }

    let status: "disconnected" | "action_required" | "connected";
    let statusDetail: string | null;
    if (accountIdentifier && hasCredential) {
      status = "connected";
      statusDetail = null;
    } else if (accountIdentifier || hasCredential) {
      status = "action_required";
      statusDetail = accountIdentifier
        ? "Missing an API credential."
        : "Missing an account/tax-office identifier.";
    } else {
      status = "disconnected";
      statusDetail = null;
    }

    const saved = await this.prisma.eInvoiceProviderConnection.upsert({
      where: { storeId_category: { storeId, category: input.category } },
      create: {
        storeId,
        organizationId: ctx.organizationId,
        category: input.category,
        providerName: input.providerName,
        accountIdentifier,
        hasCredential,
        status,
        statusDetail,
        connectedAt: status === "connected" ? new Date() : null,
      },
      update: {
        providerName: input.providerName,
        accountIdentifier,
        hasCredential,
        status,
        statusDetail,
        connectedAt: status === "connected" ? new Date() : null,
      },
    });

    await this.audit.record({
      organizationId: ctx.organizationId,
      storeId,
      actorId: ctx.actor.id,
      action: "einvoice_connection.upserted",
      resourceType: "einvoice_provider_connection",
      resourceId: saved.id,
      after: { category: input.category, providerName: input.providerName, status },
      meta,
    });

    return this.toSummary(saved);
  }
}
