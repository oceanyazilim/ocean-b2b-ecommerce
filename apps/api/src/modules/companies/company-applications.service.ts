import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type {
  Address,
  ApproveCompanyApplicationInput,
  CompanyApplicationListQuery,
  CompanyApplicationStatus,
  CompanyApplicationSummary,
  Paginated,
  SubmitCompanyApplicationInput,
} from "@ocean/types";

import { ConflictError, NotFoundError, ValidationError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import { isUniqueViolation } from "../../common/prisma-errors";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { STORAGE_ADAPTER, type StorageAdapter } from "../../infrastructure/storage/storage.types";
import { AuditService } from "../audit/audit.service";
import { CustomersService } from "../customers/customers.service";
import { EventsService } from "../events/events.service";
import { CompaniesService } from "./companies.service";

const include = {
  reviewer: { select: { id: true, name: true } },
  documents: {
    include: {
      media: { select: { id: true, originalFilename: true, storageKey: true, mime: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.CompanyApplicationInclude;
type Row = Prisma.CompanyApplicationGetPayload<{ include: typeof include }>;

const OPEN: CompanyApplicationStatus[] = ["pending", "under_review"];
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

@Injectable()
export class CompanyApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService,
    private readonly customers: CustomersService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
  ) {}

  private scope(ctx: TenantContext): Prisma.CompanyApplicationWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId };
  }

  private toSummary(row: Row): CompanyApplicationSummary {
    return {
      id: row.id,
      status: row.status as CompanyApplicationStatus,
      source: row.source,
      legalName: row.legalName,
      displayName: row.displayName,
      taxNumber: row.taxNumber,
      taxOffice: row.taxOffice,
      industry: row.industry,
      website: row.website,
      expectedMonthlyVolume: row.expectedMonthlyVolume,
      contactFirstName: row.contactFirstName,
      contactLastName: row.contactLastName,
      contactEmail: row.contactEmail,
      contactPhone: row.contactPhone,
      address: (row.address as unknown as Address | null) ?? null,
      message: row.message,
      documents: row.documents.map((d) => ({
        mediaId: d.media.id,
        name: d.media.originalFilename,
        url: this.storage.publicUrl(d.media.storageKey),
        mime: d.media.mime,
      })),
      reviewer: row.reviewer,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      decisionNote: row.decisionNote,
      companyId: row.companyId,
      customerId: row.customerId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async list(
    ctx: TenantContext,
    query: CompanyApplicationListQuery,
  ): Promise<Paginated<CompanyApplicationSummary>> {
    const rows = await this.prisma.companyApplication.findMany({
      where: {
        ...this.scope(ctx),
        ...(query.status ? { status: query.status } : {}),
        ...(query.q
          ? {
              OR: [
                { legalName: { contains: query.q, mode: "insensitive" } },
                { contactEmail: { contains: query.q, mode: "insensitive" } },
                { contactLastName: { contains: query.q, mode: "insensitive" } },
                { taxNumber: { contains: query.q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    return {
      data: page.map((r) => this.toSummary(r)),
      pageInfo: { hasNextPage, endCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null },
    };
  }

  async get(ctx: TenantContext, id: string): Promise<CompanyApplicationSummary> {
    const row = await this.prisma.companyApplication.findFirst({
      where: { ...this.scope(ctx), id },
      include,
    });
    if (!row) throw new NotFoundError("Application");
    return this.toSummary(row);
  }

  // Storefront submissions (Phase 8) call this with source "storefront" and the customer's
  // own session; staff can also key one in on the applicant's behalf.
  async submit(
    ctx: TenantContext,
    input: SubmitCompanyApplicationInput,
    source: "storefront" | "admin",
    meta: RequestMeta,
  ): Promise<CompanyApplicationSummary> {
    const id = await this.prisma.$transaction(async (tx) => {
      const mediaIds = [...new Set(input.documentMediaIds)];
      if (mediaIds.length) {
        const found = await tx.media.count({
          where: { storeId: ctx.storeId as string, deletedAt: null, id: { in: mediaIds } },
        });
        if (found !== mediaIds.length) {
          throw new ValidationError("One or more documents were not found.", [
            { path: "documentMediaIds", message: "Unknown file" },
          ]);
        }
      }
      const open = await tx.companyApplication.findFirst({
        where: { ...this.scope(ctx), contactEmail: input.contactEmail, status: { in: OPEN } },
        select: { id: true },
      });
      if (open) {
        throw new ConflictError("An application from this contact is already being reviewed.", [
          { path: "contactEmail", message: "Application already open" },
        ]);
      }
      const created = await tx.companyApplication.create({
        data: {
          storeId: ctx.storeId as string,
          organizationId: ctx.organizationId,
          source,
          legalName: input.legalName,
          displayName: input.displayName ?? null,
          taxNumber: input.taxNumber ?? null,
          taxOffice: input.taxOffice ?? null,
          industry: input.industry ?? null,
          website: input.website ?? null,
          expectedMonthlyVolume: input.expectedMonthlyVolume ?? null,
          contactFirstName: input.contactFirstName,
          contactLastName: input.contactLastName,
          contactEmail: input.contactEmail,
          contactPhone: input.contactPhone ?? null,
          address: input.address ? json(input.address) : undefined,
          message: input.message ?? null,
          documents: { create: mediaIds.map((mediaId) => ({ mediaId })) },
        },
      });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "company_application.submitted",
          resourceType: "company_application",
          resourceId: created.id,
          after: { legalName: created.legalName, contactEmail: created.contactEmail, source },
          meta,
        },
        tx,
      );
      await this.events.publish(
        ctx,
        "company_application.submitted",
        { applicationId: created.id, source },
        tx,
      );
      return created.id;
    });
    return this.get(ctx, id);
  }

  async startReview(ctx: TenantContext, id: string, meta: RequestMeta) {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.requireOpen(ctx, id, tx);
      if (current.status === "under_review") return;
      await tx.companyApplication.update({
        where: { id },
        data: { status: "under_review", reviewerId: ctx.actor.id },
      });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "company_application.review_started",
          resourceType: "company_application",
          resourceId: id,
          meta,
        },
        tx,
      );
      await this.events.publish(
        ctx,
        "company_application.review_started",
        { applicationId: id },
        tx,
      );
    });
    return this.get(ctx, id);
  }

  // Approval materialises the account in one transaction: company → default location (if an
  // address is known) → contact customer (found or created) → company admin membership.
  async approve(
    ctx: TenantContext,
    id: string,
    input: ApproveCompanyApplicationInput,
    meta: RequestMeta,
  ): Promise<CompanyApplicationSummary> {
    const currency = input.currency ?? (await this.companies.storeCurrency(ctx));
    await this.prisma
      .$transaction(async (tx) => {
        const current = await this.requireOpen(ctx, id, tx);
        await this.companies.assertAccountManager(ctx, input.accountManagerId ?? null, tx);
        const legalName = input.legalName ?? current.legalName;
        const company = await tx.company.create({
          data: {
            storeId: ctx.storeId as string,
            organizationId: ctx.organizationId,
            legalName,
            displayName:
              input.displayName === undefined
                ? (current.displayName ?? legalName)
                : (input.displayName ?? legalName),
            taxNumber: input.taxNumber === undefined ? current.taxNumber : input.taxNumber,
            taxOffice: input.taxOffice === undefined ? current.taxOffice : input.taxOffice,
            industry: input.industry === undefined ? current.industry : input.industry,
            currency,
            status: "active",
            accountManagerId: input.accountManagerId ?? null,
            website: current.website,
            phone: current.contactPhone,
            email: current.contactEmail,
            note: input.note ?? null,
          },
        });
        const address = input.address ?? (current.address as unknown as Address | null);
        if (address) {
          await tx.companyLocation.create({
            data: {
              companyId: company.id,
              storeId: ctx.storeId as string,
              organizationId: ctx.organizationId,
              name: input.locationName ?? "Head office",
              phone: current.contactPhone,
              email: current.contactEmail,
              shippingAddress: json(address),
              taxNumber: company.taxNumber,
              isDefault: true,
              isActive: true,
            },
          });
        }
        const customer = await this.customers.findOrCreateByEmail(
          ctx,
          {
            email: current.contactEmail,
            firstName: current.contactFirstName,
            lastName: current.contactLastName,
          },
          meta,
          tx,
        );
        await tx.companyUser.create({
          data: {
            companyId: company.id,
            customerId: customer.id,
            storeId: ctx.storeId as string,
            organizationId: ctx.organizationId,
            role: "company_admin",
            allLocations: true,
          },
        });
        await tx.companyApplication.update({
          where: { id },
          data: {
            status: "approved",
            reviewerId: ctx.actor.id,
            reviewedAt: new Date(),
            decisionNote: input.note ?? null,
            companyId: company.id,
            customerId: customer.id,
          },
        });
        await this.audit.record(
          {
            organizationId: ctx.organizationId,
            storeId: ctx.storeId,
            actorId: ctx.actor.id,
            action: "company_application.approved",
            resourceType: "company_application",
            resourceId: id,
            after: { companyId: company.id, customerId: customer.id },
            meta,
          },
          tx,
        );
        await this.audit.record(
          {
            organizationId: ctx.organizationId,
            storeId: ctx.storeId,
            actorId: ctx.actor.id,
            action: "company.created",
            resourceType: "company",
            resourceId: company.id,
            after: { legalName, status: "active", currency, applicationId: id },
            meta,
          },
          tx,
        );
        await this.events.publish(ctx, "company.created", { companyId: company.id }, tx);
        await this.events.publish(
          ctx,
          "company_application.approved",
          { applicationId: id, companyId: company.id, customerId: customer.id },
          tx,
        );
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError(
            "A company with this tax number already exists. Link the applicant to it instead, or clear the tax number before approving.",
            [{ path: "taxNumber", message: "Already in use" }],
          );
        }
        throw error;
      });
    return this.get(ctx, id);
  }

  async reject(ctx: TenantContext, id: string, note: string, meta: RequestMeta) {
    await this.prisma.$transaction(async (tx) => {
      await this.requireOpen(ctx, id, tx);
      await tx.companyApplication.update({
        where: { id },
        data: {
          status: "rejected",
          reviewerId: ctx.actor.id,
          reviewedAt: new Date(),
          decisionNote: note,
        },
      });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "company_application.rejected",
          resourceType: "company_application",
          resourceId: id,
          after: { note },
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "company_application.rejected", { applicationId: id }, tx);
    });
    return this.get(ctx, id);
  }

  private async requireOpen(ctx: TenantContext, id: string, tx: Prisma.TransactionClient) {
    const current = await tx.companyApplication.findFirst({ where: { ...this.scope(ctx), id } });
    if (!current) throw new NotFoundError("Application");
    if (!OPEN.includes(current.status as CompanyApplicationStatus)) {
      throw new ConflictError(`This application was already ${current.status}.`);
    }
    return current;
  }
}
