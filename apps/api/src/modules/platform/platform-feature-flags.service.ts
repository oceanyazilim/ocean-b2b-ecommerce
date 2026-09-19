import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";
import type {
  CreateFeatureFlagInput,
  PlatformFeatureFlagSummary,
  SetFeatureFlagTargetInput,
  UpdateFeatureFlagInput,
} from "@ocean/types";

import { ConflictError, NotFoundError, ValidationError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

// Real CRUD for FeatureFlag/FeatureFlagTarget (Phase 14's models). Phase 14 only ever gave an
// organization a self-serve toggle for a flag some platform operator had already rolled out to
// it (BillingModule's FeatureFlagsService) — there was explicitly no place to create a flag, set
// its global default, or target it at a specific org/store, because no platform-operator role
// existed yet. This is that place.
@Injectable()
export class PlatformFeatureFlagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private toSummary(flag: {
    id: string;
    key: string;
    description: string | null;
    defaultOn: boolean;
    createdAt: Date;
    targets: {
      id: string;
      organizationId: string | null;
      organization: { name: string } | null;
      storeId: string | null;
      store: { name: string } | null;
      enabled: boolean;
      updatedAt: Date;
    }[];
  }): PlatformFeatureFlagSummary {
    return {
      id: flag.id,
      key: flag.key,
      description: flag.description,
      defaultOn: flag.defaultOn,
      createdAt: flag.createdAt.toISOString(),
      targets: flag.targets.map((t) => ({
        id: t.id,
        organizationId: t.organizationId,
        organizationName: t.organization?.name ?? null,
        storeId: t.storeId,
        storeName: t.store?.name ?? null,
        enabled: t.enabled,
        updatedAt: t.updatedAt.toISOString(),
      })),
    };
  }

  private include() {
    return {
      targets: {
        include: {
          organization: { select: { name: true } },
          store: { select: { name: true } },
        },
        orderBy: { updatedAt: "desc" as const },
      },
    };
  }

  async list(): Promise<PlatformFeatureFlagSummary[]> {
    const flags = await this.prisma.featureFlag.findMany({
      orderBy: { key: "asc" },
      include: this.include(),
    });
    return flags.map((f) => this.toSummary(f));
  }

  private async findByKeyOrThrow(key: string) {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { key },
      include: this.include(),
    });
    if (!flag) throw new NotFoundError("Feature flag");
    return flag;
  }

  async create(
    input: CreateFeatureFlagInput,
    operatorId: string,
    meta: RequestMeta,
  ): Promise<PlatformFeatureFlagSummary> {
    const existing = await this.prisma.featureFlag.findUnique({ where: { key: input.key } });
    if (existing) throw new ConflictError(`A feature flag with key "${input.key}" already exists.`);
    const flag = await this.prisma.featureFlag.create({
      data: { key: input.key, description: input.description ?? null, defaultOn: input.defaultOn },
      include: this.include(),
    });
    await this.audit.record({
      actorType: "platform",
      actorId: operatorId,
      action: "feature_flag.created",
      resourceType: "feature_flag",
      resourceId: flag.id,
      after: { key: flag.key, defaultOn: flag.defaultOn },
      meta,
    });
    return this.toSummary(flag);
  }

  async update(
    key: string,
    input: UpdateFeatureFlagInput,
    operatorId: string,
    meta: RequestMeta,
  ): Promise<PlatformFeatureFlagSummary> {
    const flag = await this.findByKeyOrThrow(key);
    const updated = await this.prisma.featureFlag.update({
      where: { id: flag.id },
      data: {
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.defaultOn !== undefined ? { defaultOn: input.defaultOn } : {}),
      },
      include: this.include(),
    });
    await this.audit.record({
      actorType: "platform",
      actorId: operatorId,
      action: "feature_flag.updated",
      resourceType: "feature_flag",
      resourceId: flag.id,
      before: { description: flag.description, defaultOn: flag.defaultOn },
      after: { description: updated.description, defaultOn: updated.defaultOn },
      meta,
    });
    return this.toSummary(updated);
  }

  async setTarget(
    key: string,
    input: SetFeatureFlagTargetInput,
    operatorId: string,
    meta: RequestMeta,
  ): Promise<PlatformFeatureFlagSummary> {
    const flag = await this.findByKeyOrThrow(key);
    if (input.organizationId) {
      const org = await this.prisma.organization.findUnique({ where: { id: input.organizationId } });
      if (!org) throw new ValidationError("Organization not found.", [{ path: "organizationId", message: "Not found" }]);
    }
    if (input.storeId) {
      const store = await this.prisma.store.findUnique({ where: { id: input.storeId } });
      if (!store) throw new ValidationError("Store not found.", [{ path: "storeId", message: "Not found" }]);
    }

    // A real DB-level upsert against the partial unique index that backs "one target row per
    // (flag, organization) / (flag, store)" (see this table's @@index comment in schema.prisma and
    // the feature_flag_targets_one_target migration) — not the findFirst-then-create/update this
    // replaced, which raced: two concurrent setTarget calls for the same target could both see no
    // existing row and both insert one. Postgres now rejects the second insert's conflict itself,
    // and ON CONFLICT ... DO UPDATE turns that into the intended update. Prisma's schema DSL can't
    // express a partial unique constraint, so there's no generated `upsert()` for it — this is the
    // raw-SQL equivalent. Wrapped in a transaction so the row write and its audit entry commit
    // together.
    await this.prisma.$transaction(async (tx) => {
      if (input.organizationId) {
        await tx.$executeRaw`
          INSERT INTO "feature_flag_targets" ("id", "flag_id", "organization_id", "store_id", "enabled", "created_at", "updated_at")
          VALUES (${randomUUID()}::uuid, ${flag.id}::uuid, ${input.organizationId}::uuid, NULL, ${input.enabled}, now(), now())
          ON CONFLICT ("flag_id", "organization_id") WHERE "organization_id" IS NOT NULL
          DO UPDATE SET "enabled" = EXCLUDED."enabled", "updated_at" = now()
        `;
      } else {
        await tx.$executeRaw`
          INSERT INTO "feature_flag_targets" ("id", "flag_id", "organization_id", "store_id", "enabled", "created_at", "updated_at")
          VALUES (${randomUUID()}::uuid, ${flag.id}::uuid, NULL, ${input.storeId}::uuid, ${input.enabled}, now(), now())
          ON CONFLICT ("flag_id", "store_id") WHERE "store_id" IS NOT NULL
          DO UPDATE SET "enabled" = EXCLUDED."enabled", "updated_at" = now()
        `;
      }
      await this.audit.record(
        {
          organizationId: input.organizationId ?? null,
          storeId: input.storeId ?? null,
          actorType: "platform",
          actorId: operatorId,
          action: "feature_flag.target_set",
          resourceType: "feature_flag",
          resourceId: flag.id,
          after: {
            key: flag.key,
            organizationId: input.organizationId,
            storeId: input.storeId,
            enabled: input.enabled,
          },
          meta,
        },
        tx,
      );
    });
    return this.toSummary(await this.findByKeyOrThrow(key));
  }

  async removeTarget(
    key: string,
    targetId: string,
    operatorId: string,
    meta: RequestMeta,
  ): Promise<PlatformFeatureFlagSummary> {
    const flag = await this.findByKeyOrThrow(key);
    const target = flag.targets.find((t) => t.id === targetId);
    if (!target) throw new NotFoundError("Feature flag target");
    await this.prisma.featureFlagTarget.delete({ where: { id: targetId } });
    await this.audit.record({
      organizationId: target.organizationId,
      storeId: target.storeId,
      actorType: "platform",
      actorId: operatorId,
      action: "feature_flag.target_removed",
      resourceType: "feature_flag",
      resourceId: flag.id,
      before: { organizationId: target.organizationId, storeId: target.storeId, enabled: target.enabled },
      meta,
    });
    return this.toSummary(await this.findByKeyOrThrow(key));
  }
}
