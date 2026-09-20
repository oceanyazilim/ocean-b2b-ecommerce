import { Injectable } from "@nestjs/common";
import type { Organization, Prisma } from "@ocean/db";
import type {
  BusinessAddressAnswers,
  BusinessProfileAnswers,
  CreateOrganizationInput,
  OrganizationBusinessProfile,
  OrganizationBusinessVerification,
  OrganizationSummary,
  UpdateBusinessProfileInput,
  UpdateOrganizationInput,
} from "@ocean/types";

import { ConflictError, ForbiddenError, NotFoundError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import { uniqueSlug } from "../../common/slug";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CountryProfilesService } from "../countries/countries.service";
import { UsersService } from "../users/users.service";
import { computeBusinessVerification } from "./business-verification";
import { validateBusinessProfileSubmission } from "./business-profile-validation";
import { OrganizationsRepository } from "./organizations.repository";

export function toOrganizationSummary(org: Organization): OrganizationSummary {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    status: org.status,
    createdAt: org.createdAt.toISOString(),
  };
}

export function toBusinessProfile(org: Organization): OrganizationBusinessProfile {
  return {
    countryCode: org.businessCountryCode,
    businessEntityType: org.businessEntityType,
    businessProfile: (org.businessProfile as BusinessProfileAnswers | null) ?? {},
    businessAddress: (org.businessAddress as BusinessAddressAnswers | null) ?? {},
    businessProfileCompletedAt: org.businessProfileCompletedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: OrganizationsRepository,
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly countries: CountryProfilesService,
  ) {}

  async listForUser(userId: string): Promise<OrganizationSummary[]> {
    return (await this.repo.listForUser(userId)).map(toOrganizationSummary);
  }

  async create(
    userId: string,
    input: CreateOrganizationInput,
    meta: RequestMeta,
  ): Promise<OrganizationSummary> {
    const user = await this.users.findById(userId);
    if (!user?.emailVerifiedAt) {
      throw new ForbiddenError("Verify your email address before creating an organization.");
    }

    const org = await this.prisma.$transaction(async (tx) => {
      if (input.slug && (await this.repo.slugExists(input.slug, tx))) {
        throw new ConflictError("This slug is already taken.", [
          { path: "slug", message: "Already taken" },
        ]);
      }
      const slug =
        input.slug ?? (await uniqueSlug(input.name, (c) => this.repo.slugExists(c, tx), "org"));
      const created = await this.repo.createWithOwner({ name: input.name, slug }, userId, tx);
      await this.audit.record(
        {
          organizationId: created.id,
          actorId: userId,
          action: "organization.created",
          resourceType: "organization",
          resourceId: created.id,
          after: { name: created.name, slug: created.slug },
          meta,
        },
        tx,
      );
      return created;
    });
    return toOrganizationSummary(org);
  }

  async get(tenant: TenantContext): Promise<OrganizationSummary> {
    const org = await this.repo.findById(tenant.organizationId);
    if (!org) throw new NotFoundError("Organization");
    return toOrganizationSummary(org);
  }

  async update(
    tenant: TenantContext,
    input: UpdateOrganizationInput,
    meta: RequestMeta,
  ): Promise<OrganizationSummary> {
    const before = await this.repo.findById(tenant.organizationId);
    if (!before) throw new NotFoundError("Organization");
    const after = await this.repo.update(tenant.organizationId, input);
    await this.audit.record({
      organizationId: tenant.organizationId,
      actorId: tenant.actor.id,
      action: "organization.updated",
      resourceType: "organization",
      resourceId: after.id,
      before: { name: before.name },
      after: { name: after.name },
      meta,
    });
    return toOrganizationSummary(after);
  }

  async getBusinessProfile(tenant: TenantContext): Promise<OrganizationBusinessProfile> {
    const org = await this.repo.findById(tenant.organizationId);
    if (!org) throw new NotFoundError("Organization");
    return toBusinessProfile(org);
  }

  // Re-validates the submitted answers against the REAL schema of whichever CountryProfile the
  // merchant picked (see business-profile-validation.ts) before persisting — never trusts the
  // client-side form's validation alone, since this is compliance-relevant business/tax data.
  async updateBusinessProfile(
    tenant: TenantContext,
    input: UpdateBusinessProfileInput,
    meta: RequestMeta,
  ): Promise<OrganizationBusinessProfile> {
    const before = await this.repo.findById(tenant.organizationId);
    if (!before) throw new NotFoundError("Organization");

    const country = await this.countries.getCountryProfile(input.countryCode);
    if (!country) {
      throw new ConflictError("Unknown country.", [
        { path: "countryCode", message: "Unknown country" },
      ]);
    }

    const validated = validateBusinessProfileSubmission(country, {
      businessEntityType: input.businessEntityType,
      businessProfile: input.businessProfile,
      businessAddress: input.businessAddress,
    });

    const after = await this.repo.update(tenant.organizationId, {
      businessCountryCode: country.countryCode,
      businessEntityType: validated.businessEntityType,
      businessProfile: validated.businessProfile,
      businessAddress: validated.businessAddress,
      businessProfileCompletedAt: new Date(),
    });

    await this.audit.record({
      organizationId: tenant.organizationId,
      actorId: tenant.actor.id,
      action: "organization.business_profile_updated",
      resourceType: "organization",
      resourceId: after.id,
      before: {
        countryCode: before.businessCountryCode,
        businessEntityType: before.businessEntityType,
      },
      after: { countryCode: after.businessCountryCode, businessEntityType: after.businessEntityType },
      meta,
    });

    return toBusinessProfile(after);
  }

  // Business verification (L5, spec section 30): recomputed from real data every time this is
  // read — the business profile/address answers (L2) and this org's tax registrations (L3) — and
  // the result is persisted back onto the Organization as a cache for anything else that wants to
  // read the last-known status cheaply. See business-verification.ts for what each category
  // checks and why identity/banking are always "not_collected".
  async getBusinessVerification(tenant: TenantContext): Promise<OrganizationBusinessVerification> {
    const org = await this.repo.findById(tenant.organizationId);
    if (!org) throw new NotFoundError("Organization");

    const country = org.businessCountryCode
      ? await this.countries.getCountryProfile(org.businessCountryCode)
      : null;
    const taxRegistrations = await this.prisma.taxRegistration.findMany({
      where: { organizationId: tenant.organizationId },
      select: { countryCode: true, status: true },
    });

    const result = computeBusinessVerification(
      {
        businessCountryCode: org.businessCountryCode,
        businessEntityType: org.businessEntityType,
        businessProfile: (org.businessProfile as BusinessProfileAnswers | null) ?? {},
        businessAddress: (org.businessAddress as BusinessAddressAnswers | null) ?? {},
      },
      country,
      taxRegistrations,
    );

    await this.repo.update(tenant.organizationId, {
      verificationStatus: result.status,
      verificationCategories: result.categories as unknown as Prisma.InputJsonValue,
      verificationCheckedAt: new Date(result.checkedAt),
    });

    return result;
  }
}
