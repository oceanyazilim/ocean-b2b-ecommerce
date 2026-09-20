import { Injectable } from "@nestjs/common";
import { Prisma } from "@ocean/db";
import type { BankInfo, InvoiceSettingsSummary, UpdateInvoiceSettingsInput } from "@ocean/types";

import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

// Finance -> Invoicing settings (spec section 28): the real, persisted configuration layer real
// invoice generation reads from. One row per store, created lazily on first save — see
// InvoiceSettings in schema.prisma for why it's store-scoped (same scope Store.invoiceSequence,
// which it configures, already lives at).
//
// Honesty boundary (see the L5 commit message for the full note): this codebase's Phase 12
// invoicing has no PDF/document generator — `Invoice` is a data record, not a rendered document.
// The two places these settings are genuinely wired into real invoice output are (1)
// `invoicePrefix`, read by FinanceService.create() when it generates `Invoice.number`, and (2)
// the `issuer` snapshot FinanceService.toDetail() embeds into every InvoiceDetail response, read
// live from this table. `numberingStart` is applied to Store.invoiceSequence, but only once, and
// only while the store has issued zero invoices — see `update()` below.
@Injectable()
export class InvoicingSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async loadStore(storeId: string) {
    return this.prisma.store.findUniqueOrThrow({
      where: { id: storeId },
      select: {
        defaultCurrency: true,
        defaultLocale: true,
        organization: { select: { name: true, businessCountryCode: true } },
      },
    });
  }

  // Best-effort default for taxId (spec: "defaulting ... tax-id ... sensibly from L2's business
  // profile where available"): the store's own active TaxRegistration for its org's real L2
  // business country, if any — real data, never guessed.
  private async defaultTaxId(storeId: string, businessCountryCode: string | null): Promise<string | null> {
    if (!businessCountryCode) return null;
    const reg = await this.prisma.taxRegistration.findFirst({
      where: { storeId, countryCode: businessCountryCode, status: "active", registrationNumber: { not: null } },
      orderBy: { createdAt: "asc" },
    });
    return reg?.registrationNumber ?? null;
  }

  private toSummary(
    settings: {
      invoicePrefix: string;
      numberingStart: number | null;
      legalName: string | null;
      taxId: string | null;
      registeredAddress: string | null;
      bankInfo: Prisma.JsonValue | null;
      footerNotice: string | null;
      currency: string | null;
      language: string | null;
      updatedAt: Date;
    } | null,
    store: { defaultCurrency: string; defaultLocale: string; organization: { name: string } },
    invoiceCount: number,
    defaultTaxId: string | null,
  ): InvoiceSettingsSummary {
    return {
      storeId: "", // overwritten by caller
      invoicePrefix: settings?.invoicePrefix ?? "INV-",
      numberingStart: settings?.numberingStart ?? null,
      numberingCanApply: invoiceCount === 0,
      legalName: settings?.legalName ?? store.organization.name,
      taxId: settings?.taxId ?? defaultTaxId,
      registeredAddress: settings?.registeredAddress ?? null,
      bankInfo: (settings?.bankInfo as unknown as BankInfo | null) ?? null,
      footerNotice: settings?.footerNotice ?? null,
      currency: settings?.currency ?? store.defaultCurrency,
      language: settings?.language ?? store.defaultLocale,
      configured: Boolean(settings),
      updatedAt: settings?.updatedAt.toISOString() ?? null,
    };
  }

  async get(ctx: TenantContext): Promise<InvoiceSettingsSummary> {
    const storeId = ctx.storeId as string;
    const [store, settings, invoiceCount] = await Promise.all([
      this.loadStore(storeId),
      this.prisma.invoiceSettings.findUnique({ where: { storeId } }),
      this.prisma.invoice.count({ where: { storeId } }),
    ]);
    const defaultTaxId = settings?.taxId
      ? null
      : await this.defaultTaxId(storeId, store.organization.businessCountryCode);
    return { ...this.toSummary(settings, store, invoiceCount, defaultTaxId), storeId };
  }

  async update(
    ctx: TenantContext,
    input: UpdateInvoiceSettingsInput,
    meta: RequestMeta,
  ): Promise<InvoiceSettingsSummary> {
    const storeId = ctx.storeId as string;
    const before = await this.prisma.invoiceSettings.findUnique({ where: { storeId } });

    const scalarPatch: Record<string, unknown> = {};
    if (input.invoicePrefix !== undefined) scalarPatch.invoicePrefix = input.invoicePrefix;
    if (input.numberingStart !== undefined) scalarPatch.numberingStart = input.numberingStart;
    if (input.legalName !== undefined) scalarPatch.legalName = input.legalName;
    if (input.taxId !== undefined) scalarPatch.taxId = input.taxId;
    if (input.registeredAddress !== undefined) scalarPatch.registeredAddress = input.registeredAddress;
    if (input.bankInfo !== undefined) {
      scalarPatch.bankInfo = input.bankInfo === null ? Prisma.JsonNull : input.bankInfo;
    }
    if (input.footerNotice !== undefined) scalarPatch.footerNotice = input.footerNotice;
    if (input.currency !== undefined) scalarPatch.currency = input.currency;
    if (input.language !== undefined) scalarPatch.language = input.language;

    await this.prisma.$transaction(async (tx) => {
      await tx.invoiceSettings.upsert({
        where: { storeId },
        create: { storeId, organizationId: ctx.organizationId, ...scalarPatch },
        update: scalarPatch,
      });

      // Re-seed Store.invoiceSequence from numberingStart, but only while nothing has been
      // invoiced yet — otherwise this would renumber/collide with real invoices already issued
      // to a buyer. invoiceSequence is incremented *before* use (see FinanceService.create), so
      // seeding it to numberingStart - 1 makes the next invoice come out as numberingStart.
      //
      // The zero-invoices check is read here, inside the transaction via `tx`, rather than
      // before the transaction starts: reading it earlier would leave a window between the
      // check and this write where a concurrent invoice-creation request could issue the store's
      // first real invoice, making this update collide with/renumber it. Reading through `tx`
      // keeps the check and the write atomic.
      if (input.numberingStart !== undefined && input.numberingStart !== null) {
        const invoiceCount = await tx.invoice.count({ where: { storeId } });
        if (invoiceCount === 0) {
          await tx.store.update({
            where: { id: storeId },
            data: { invoiceSequence: input.numberingStart - 1 },
          });
        }
      }

      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId,
          actorId: ctx.actor.id,
          action: "invoice_settings.updated",
          resourceType: "invoice_settings",
          resourceId: storeId,
          before: before ? { ...before, bankInfo: undefined } : null,
          after: scalarPatch,
          meta,
        },
        tx,
      );
    });

    return this.get(ctx);
  }
}
