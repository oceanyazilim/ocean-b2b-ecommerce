import { Injectable } from "@nestjs/common";
import type { Store } from "@ocean/db";
import type {
  CreateStoreInput,
  StoreSummary,
  UpdateOnboardingInput,
  UpdateStoreInput,
} from "@ocean/types";

import { ConflictError, NotFoundError, ValidationError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import { uniqueSlug } from "../../common/slug";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { StoresRepository } from "./stores.repository";

export function toStoreSummary(store: Store): StoreSummary {
  return {
    id: store.id,
    organizationId: store.organizationId,
    name: store.name,
    slug: store.slug,
    status: store.status,
    defaultCurrency: store.defaultCurrency,
    defaultLocale: store.defaultLocale,
    timezone: store.timezone,
    businessType: store.businessType,
    industry: store.industry,
    onboardingState: (store.onboardingState ?? {}) as Record<string, boolean>,
    createdAt: store.createdAt.toISOString(),
  };
}

function assertTimezone(tz: string): void {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
  } catch {
    throw new ValidationError(`"${tz}" is not a valid IANA time zone.`, [
      { path: "timezone", message: "Unknown time zone" },
    ]);
  }
}

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: StoresRepository,
    private readonly audit: AuditService,
  ) {}

  async listForOrganization(tenant: TenantContext): Promise<StoreSummary[]> {
    return (await this.repo.listForOrganization(tenant)).map(toStoreSummary);
  }

  async create(
    tenant: TenantContext,
    input: CreateStoreInput,
    meta: RequestMeta,
  ): Promise<StoreSummary> {
    assertTimezone(input.timezone);
    const store = await this.prisma.$transaction(async (tx) => {
      if (input.slug && (await this.repo.slugExists(input.slug, tx))) {
        throw new ConflictError("This store URL is already taken.", [
          { path: "slug", message: "Already taken" },
        ]);
      }
      const slug = input.slug ?? (await uniqueSlug(input.name, (c) => this.repo.slugExists(c, tx)));
      const created = await this.repo.createWithOwner(
        tenant,
        {
          name: input.name,
          slug,
          defaultCurrency: input.defaultCurrency,
          defaultLocale: input.defaultLocale,
          timezone: input.timezone,
          businessType: input.businessType ?? null,
          industry: input.industry ?? null,
        },
        tenant.actor.id,
        tx,
      );
      await this.audit.record(
        {
          organizationId: tenant.organizationId,
          storeId: created.id,
          actorId: tenant.actor.id,
          action: "store.created",
          resourceType: "store",
          resourceId: created.id,
          after: {
            name: created.name,
            slug: created.slug,
            defaultCurrency: created.defaultCurrency,
          },
          meta,
        },
        tx,
      );
      return created;
    });
    return toStoreSummary(store);
  }

  async get(tenant: TenantContext): Promise<StoreSummary> {
    const store = await this.repo.findInTenant(tenant);
    if (!store) throw new NotFoundError("Store");
    return toStoreSummary(store);
  }

  async update(
    tenant: TenantContext,
    input: UpdateStoreInput,
    meta: RequestMeta,
  ): Promise<StoreSummary> {
    if (input.timezone) assertTimezone(input.timezone);
    const before = await this.repo.findInTenant(tenant);
    if (!before) throw new NotFoundError("Store");
    const after = await this.repo.update(tenant, input);
    await this.audit.record({
      organizationId: tenant.organizationId,
      storeId: after.id,
      actorId: tenant.actor.id,
      action: "store.updated",
      resourceType: "store",
      resourceId: after.id,
      before: pick(before, Object.keys(input)),
      after: pick(after, Object.keys(input)),
      meta,
    });
    return toStoreSummary(after);
  }

  async updateOnboarding(
    tenant: TenantContext,
    input: UpdateOnboardingInput,
  ): Promise<StoreSummary> {
    const store = await this.repo.findInTenant(tenant);
    if (!store) throw new NotFoundError("Store");
    const state = { ...((store.onboardingState ?? {}) as Record<string, boolean>) };
    state[input.step] = input.completed;
    const updated = await this.repo.update(tenant, { onboardingState: state });
    return toStoreSummary(updated);
  }
}

function pick(obj: Store, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = (obj as unknown as Record<string, unknown>)[k];
  return out;
}
