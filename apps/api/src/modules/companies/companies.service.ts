import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type {
  AccountManagerCandidate,
  CompanyCandidate,
  CompanyDetail,
  CompanyListQuery,
  CompanySearchQuery,
  CompanyStats,
  CompanyStatus,
  CompanySummary,
  CreateCompanyInput,
  Paginated,
  UpdateCompanyInput,
} from "@ocean/types";

import { ConflictError, NotFoundError, ValidationError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import { isUniqueViolation, uniqueViolationTarget } from "../../common/prisma-errors";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CountryProfilesService } from "../countries/countries.service";
import { EventsService } from "../events/events.service";
import {
  companyDetailInclude,
  companySummaryInclude,
  toCompanyDetail,
  toCompanySummary,
} from "./company.mapper";

const SORT: Record<CompanyListQuery["sort"], Prisma.CompanyOrderByWithRelationInput[]> = {
  created_desc: [{ createdAt: "desc" }, { id: "desc" }],
  created_asc: [{ createdAt: "asc" }, { id: "asc" }],
  updated_desc: [{ updatedAt: "desc" }, { id: "desc" }],
  name_asc: [{ displayName: "asc" }, { id: "asc" }],
  name_desc: [{ displayName: "desc" }, { id: "desc" }],
};

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const normalizeTags = (tags: string[]) => [...new Set(tags.map((t) => t.trim()).filter(Boolean))];

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
    private readonly countries: CountryProfilesService,
  ) {}

  // The company detail page's tax-number field needs the right local label (VKN for Turkey,
  // VAT ID for Germany, EIN for the US, ...) instead of a hardcoded "Tax ID" (spec section 27),
  // resolved from CountryProfile.taxIdFormats for the company's tax country + id-type code.
  private async resolveTaxIdLabel(
    taxCountryCode: string | null,
    taxIdType: string | null,
  ): Promise<string | null> {
    if (!taxCountryCode) return null;
    const profile = await this.countries.getCountryProfile(taxCountryCode);
    if (!profile) return null;
    const formats = profile.taxIdFormats;
    const match = taxIdType ? formats.find((f) => f.code === taxIdType) : undefined;
    return (match ?? formats[0])?.label ?? null;
  }

  private async withTaxIdLabel(detail: CompanyDetail): Promise<CompanyDetail> {
    return {
      ...detail,
      taxIdLabel: await this.resolveTaxIdLabel(detail.taxCountryCode, detail.taxIdType),
    };
  }

  scope(ctx: TenantContext): Prisma.CompanyWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId, deletedAt: null };
  }

  async storeCurrency(ctx: TenantContext): Promise<string> {
    const store = await this.prisma.store.findUnique({
      where: { id: ctx.storeId as string },
      select: { defaultCurrency: true },
    });
    return store?.defaultCurrency ?? "TRY";
  }

  async list(ctx: TenantContext, query: CompanyListQuery): Promise<Paginated<CompanySummary>> {
    const where: Prisma.CompanyWhereInput = {
      ...this.scope(ctx),
      ...(query.status ? { status: query.status } : {}),
      ...(query.tag ? { tags: { has: query.tag } } : {}),
      ...(query.accountManagerId ? { accountManagerId: query.accountManagerId } : {}),
      ...(query.q
        ? {
            OR: [
              { displayName: { contains: query.q, mode: "insensitive" } },
              { legalName: { contains: query.q, mode: "insensitive" } },
              { taxNumber: { contains: query.q, mode: "insensitive" } },
              { externalId: { contains: query.q, mode: "insensitive" } },
              { email: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.company.findMany({
      where,
      include: companySummaryInclude,
      orderBy: SORT[query.sort],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    return {
      data: page.map(toCompanySummary),
      pageInfo: { hasNextPage, endCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null },
    };
  }

  async search(ctx: TenantContext, query: CompanySearchQuery): Promise<CompanyCandidate[]> {
    const rows = await this.prisma.company.findMany({
      where: {
        ...this.scope(ctx),
        ...(query.q
          ? {
              OR: [
                { displayName: { contains: query.q, mode: "insensitive" } },
                { legalName: { contains: query.q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ displayName: "asc" }],
      take: query.limit,
      select: { id: true, displayName: true, legalName: true, status: true },
    });
    return rows.map((r) => ({ ...r, status: r.status as CompanyStatus }));
  }

  // Staff eligible to be an account manager: active store members plus organization
  // owners/admins, who administer every store without an explicit membership.
  async accountManagerCandidates(ctx: TenantContext): Promise<AccountManagerCandidate[]> {
    const [members, admins] = await Promise.all([
      this.prisma.storeMember.findMany({
        where: { storeId: ctx.storeId as string, status: "active" },
        select: { user: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.organizationMember.findMany({
        where: {
          organizationId: ctx.organizationId,
          status: "active",
          role: { in: ["owner", "admin"] },
        },
        select: { user: { select: { id: true, name: true, email: true } } },
      }),
    ]);
    const byId = new Map<string, AccountManagerCandidate>();
    for (const row of [...members, ...admins]) byId.set(row.user.id, row.user);
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async stats(ctx: TenantContext): Promise<CompanyStats> {
    const scope = this.scope(ctx);
    const [total, active, suspended, archived, pendingApplications] = await Promise.all([
      this.prisma.company.count({ where: scope }),
      this.prisma.company.count({ where: { ...scope, status: "active" } }),
      this.prisma.company.count({ where: { ...scope, status: "suspended" } }),
      this.prisma.company.count({ where: { ...scope, status: "archived" } }),
      this.prisma.companyApplication.count({
        where: {
          storeId: ctx.storeId as string,
          organizationId: ctx.organizationId,
          status: { in: ["pending", "under_review"] },
        },
      }),
    ]);
    return { total, active, suspended, archived, pendingApplications };
  }

  async get(ctx: TenantContext, id: string): Promise<CompanyDetail> {
    const row = await this.prisma.company.findFirst({
      where: { ...this.scope(ctx), id },
      include: companyDetailInclude,
    });
    if (!row) throw new NotFoundError("Company");
    const allLocationUsers = await this.prisma.companyUser.count({
      where: { companyId: id, status: "active", allLocations: true, customer: { deletedAt: null } },
    });
    return this.withTaxIdLabel(toCompanyDetail(row, allLocationUsers));
  }

  // Cheap existence check other services use before touching a company's children.
  async require(
    ctx: TenantContext,
    id: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<{ id: string; currency: string; status: CompanyStatus; displayName: string }> {
    const row = await tx.company.findFirst({
      where: { ...this.scope(ctx), id },
      select: { id: true, currency: true, status: true, displayName: true },
    });
    if (!row) throw new NotFoundError("Company");
    return { ...row, status: row.status as CompanyStatus };
  }

  async create(
    ctx: TenantContext,
    input: CreateCompanyInput,
    meta: RequestMeta,
  ): Promise<CompanyDetail> {
    const currency = input.currency ?? (await this.storeCurrency(ctx));
    const id = await this.prisma
      .$transaction(async (tx) => {
        await this.assertAccountManager(ctx, input.accountManagerId ?? null, tx);
        const created = await tx.company.create({
          data: {
            storeId: ctx.storeId as string,
            organizationId: ctx.organizationId,
            legalName: input.legalName,
            displayName: input.displayName,
            taxNumber: input.taxNumber ?? null,
            taxOffice: input.taxOffice ?? null,
            taxCountryCode: input.taxCountryCode ?? null,
            taxIdType: input.taxIdType ?? null,
            taxValidationStatus: input.taxValidationStatus,
            taxTreatment: input.taxTreatment ?? null,
            industry: input.industry ?? null,
            currency,
            status: input.status,
            accountManagerId: input.accountManagerId ?? null,
            externalId: input.externalId ?? null,
            website: input.website ?? null,
            phone: input.phone ?? null,
            email: input.email ?? null,
            note: input.note ?? null,
            tags: normalizeTags(input.tags),
          },
        });
        if (input.location) {
          await tx.companyLocation.create({
            data: {
              companyId: created.id,
              storeId: ctx.storeId as string,
              organizationId: ctx.organizationId,
              name: input.location.name,
              externalId: input.location.externalId ?? null,
              phone: input.location.phone ?? null,
              email: input.location.email ?? null,
              shippingAddress: json(input.location.shippingAddress),
              billingAddress: input.location.billingAddress
                ? json(input.location.billingAddress)
                : undefined,
              currency: input.location.currency ?? null,
              taxExempt: input.location.taxExempt,
              taxNumber: input.location.taxNumber ?? null,
              isDefault: true,
              isActive: true,
              note: input.location.note ?? null,
            },
          });
        }
        await this.audit.record(
          {
            organizationId: ctx.organizationId,
            storeId: ctx.storeId,
            actorId: ctx.actor.id,
            action: "company.created",
            resourceType: "company",
            resourceId: created.id,
            after: { legalName: created.legalName, status: created.status, currency },
            meta,
          },
          tx,
        );
        await this.events.publish(ctx, "company.created", { companyId: created.id }, tx);
        return created.id;
      })
      .catch((error: unknown) => this.rethrowUnique(error));
    return this.get(ctx, id);
  }

  async update(
    ctx: TenantContext,
    id: string,
    input: UpdateCompanyInput,
    meta: RequestMeta,
  ): Promise<CompanyDetail> {
    await this.prisma
      .$transaction(async (tx) => {
        const current = await tx.company.findFirst({ where: { ...this.scope(ctx), id } });
        if (!current) throw new NotFoundError("Company");
        if (current.version !== input.version) {
          throw new ConflictError(
            "This company was changed by someone else. Reload to see the latest version.",
          );
        }
        if (input.accountManagerId !== undefined) {
          await this.assertAccountManager(ctx, input.accountManagerId, tx);
        }
        const data: Prisma.CompanyUncheckedUpdateInput = { version: { increment: 1 } };
        if (input.legalName !== undefined) data.legalName = input.legalName;
        if (input.displayName !== undefined) data.displayName = input.displayName;
        if (input.taxNumber !== undefined) data.taxNumber = input.taxNumber;
        if (input.taxOffice !== undefined) data.taxOffice = input.taxOffice;
        if (input.taxCountryCode !== undefined) data.taxCountryCode = input.taxCountryCode;
        if (input.taxIdType !== undefined) data.taxIdType = input.taxIdType;
        if (input.taxValidationStatus !== undefined)
          data.taxValidationStatus = input.taxValidationStatus;
        if (input.taxTreatment !== undefined) data.taxTreatment = input.taxTreatment;
        if (input.industry !== undefined) data.industry = input.industry;
        if (input.currency !== undefined) data.currency = input.currency;
        if (input.status !== undefined) data.status = input.status;
        if (input.accountManagerId !== undefined) data.accountManagerId = input.accountManagerId;
        if (input.externalId !== undefined) data.externalId = input.externalId;
        if (input.website !== undefined) data.website = input.website;
        if (input.phone !== undefined) data.phone = input.phone;
        if (input.email !== undefined) data.email = input.email;
        if (input.note !== undefined) data.note = input.note;
        if (input.tags !== undefined) data.tags = normalizeTags(input.tags);
        await tx.company.update({ where: { id }, data });
        await this.audit.record(
          {
            organizationId: ctx.organizationId,
            storeId: ctx.storeId,
            actorId: ctx.actor.id,
            action: "company.updated",
            resourceType: "company",
            resourceId: id,
            before: {
              legalName: current.legalName,
              status: current.status,
              currency: current.currency,
              accountManagerId: current.accountManagerId,
            },
            after: {
              legalName: input.legalName ?? current.legalName,
              status: input.status ?? current.status,
              currency: input.currency ?? current.currency,
              accountManagerId:
                input.accountManagerId === undefined
                  ? current.accountManagerId
                  : input.accountManagerId,
            },
            meta,
          },
          tx,
        );
        await this.events.publish(ctx, "company.updated", { companyId: id }, tx);
        if (input.status !== undefined && input.status !== current.status) {
          await this.events.publish(
            ctx,
            "company.status_changed",
            { companyId: id, from: current.status, to: input.status },
            tx,
          );
        }
      })
      .catch((error: unknown) => this.rethrowUnique(error));
    return this.get(ctx, id);
  }

  async setStatus(
    ctx: TenantContext,
    id: string,
    status: CompanyStatus,
    meta: RequestMeta,
  ): Promise<CompanyDetail> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.company.findFirst({ where: { ...this.scope(ctx), id } });
      if (!current) throw new NotFoundError("Company");
      if (current.status === status) return;
      await tx.company.update({
        where: { id },
        data: { status, version: { increment: 1 } },
      });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "company.status_changed",
          resourceType: "company",
          resourceId: id,
          before: { status: current.status },
          after: { status },
          meta,
        },
        tx,
      );
      await this.events.publish(
        ctx,
        "company.status_changed",
        { companyId: id, from: current.status, to: status },
        tx,
      );
    });
    return this.get(ctx, id);
  }

  async remove(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.company.findFirst({ where: { ...this.scope(ctx), id } });
      if (!current) throw new NotFoundError("Company");
      // Memberships go with the company; locations stay attached to the soft-deleted row so
      // order history (Phase 6) keeps resolving them.
      await tx.companyUser.deleteMany({ where: { companyId: id } });
      await tx.company.update({
        where: { id },
        data: { deletedAt: new Date(), status: "archived", version: { increment: 1 } },
      });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "company.deleted",
          resourceType: "company",
          resourceId: id,
          before: { legalName: current.legalName, taxNumber: current.taxNumber },
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "company.deleted", { companyId: id }, tx);
    });
  }

  // The account manager must be staff of this store (a store member, or an organization
  // owner/admin who administers every store).
  async assertAccountManager(
    ctx: TenantContext,
    userId: string | null,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (!userId) return;
    const [storeMember, orgMember] = await Promise.all([
      tx.storeMember.findFirst({
        where: { storeId: ctx.storeId as string, userId, status: "active" },
        select: { id: true },
      }),
      tx.organizationMember.findFirst({
        where: {
          organizationId: ctx.organizationId,
          userId,
          status: "active",
          role: { in: ["owner", "admin"] },
        },
        select: { id: true },
      }),
    ]);
    if (!storeMember && !orgMember) {
      throw new ValidationError("The account manager must be a member of this store's team.", [
        { path: "accountManagerId", message: "Not a team member" },
      ]);
    }
  }

  private rethrowUnique(error: unknown): never {
    if (isUniqueViolation(error)) {
      const target = uniqueViolationTarget(error).join(",");
      if (target.includes("external_id")) {
        throw new ConflictError("Another company already uses this external ID.", [
          { path: "externalId", message: "Already in use" },
        ]);
      }
      throw new ConflictError("A company with this tax number already exists.", [
        { path: "taxNumber", message: "Already in use" },
      ]);
    }
    throw error;
  }
}
