import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type { StoreLanguageInput, StoreLanguageSummary, UpdateStoreLanguageInput } from "@ocean/types";

import { ConflictError, NotFoundError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { EventsService } from "../events/events.service";

type StoreLanguageRow = Prisma.StoreLanguageGetPayload<Record<string, never>>;

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";

// Settings -> Languages (spec section 4). Store-scoped list of storefront languages a merchant
// has added, each independently publishable/unpublishable, with exactly one marked default.
@Injectable()
export class StoreLanguagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  private scope(ctx: TenantContext): Prisma.StoreLanguageWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId };
  }

  private toSummary(row: StoreLanguageRow): StoreLanguageSummary {
    return {
      id: row.id,
      locale: row.locale,
      isDefault: row.isDefault,
      isPublished: row.isPublished,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async list(ctx: TenantContext): Promise<StoreLanguageSummary[]> {
    const rows = await this.prisma.storeLanguage.findMany({
      where: this.scope(ctx),
      orderBy: [{ isDefault: "desc" }, { locale: "asc" }],
    });
    return rows.map((r) => this.toSummary(r));
  }

  // Storefront-facing: published languages only.
  async listPublished(ctx: TenantContext): Promise<StoreLanguageSummary[]> {
    const rows = await this.prisma.storeLanguage.findMany({
      where: { ...this.scope(ctx), isPublished: true },
      orderBy: [{ isDefault: "desc" }, { locale: "asc" }],
    });
    return rows.map((r) => this.toSummary(r));
  }

  async getDefault(ctx: TenantContext): Promise<StoreLanguageSummary | null> {
    const row = await this.prisma.storeLanguage.findFirst({ where: { ...this.scope(ctx), isDefault: true } });
    return row ? this.toSummary(row) : null;
  }

  async create(ctx: TenantContext, input: StoreLanguageInput, meta: RequestMeta): Promise<StoreLanguageSummary> {
    const existingCount = await this.prisma.storeLanguage.count({ where: this.scope(ctx) });
    // The very first language a store adds is always the default, published language — a store
    // can never end up with zero default/published languages.
    const isDefault = existingCount === 0 ? true : input.isDefault;
    const isPublished = existingCount === 0 ? true : input.isPublished;

    const created = await this.prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.storeLanguage.updateMany({ where: { ...this.scope(ctx), isDefault: true }, data: { isDefault: false } });
      }
      return tx.storeLanguage
        .create({
          data: {
            storeId: ctx.storeId as string,
            organizationId: ctx.organizationId,
            locale: input.locale,
            isDefault,
            isPublished,
          },
        })
        .catch((error: unknown) => {
          if (isUniqueViolation(error)) throw new ConflictError("This language has already been added.");
          throw error;
        });
    });

    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "language.created",
        resourceType: "store_language",
        resourceId: created.id,
        after: { locale: created.locale, isDefault: created.isDefault, isPublished: created.isPublished },
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "language.created", { storeLanguageId: created.id });
    return this.toSummary(created);
  }

  async update(
    ctx: TenantContext,
    id: string,
    input: UpdateStoreLanguageInput,
    meta: RequestMeta,
  ): Promise<StoreLanguageSummary> {
    const current = await this.prisma.storeLanguage.findFirst({ where: { ...this.scope(ctx), id } });
    if (!current) throw new NotFoundError("Store language");

    if (input.isPublished === false && current.isDefault) {
      throw new ConflictError("Cannot unpublish the default language.");
    }
    if (input.isDefault === false && current.isDefault) {
      throw new ConflictError("Assign a different default language instead of unsetting this one.");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.isDefault === true && !current.isDefault) {
        await tx.storeLanguage.updateMany({ where: { ...this.scope(ctx), isDefault: true }, data: { isDefault: false } });
      }
      const data: Prisma.StoreLanguageUncheckedUpdateInput = {};
      if (input.isDefault !== undefined) data.isDefault = input.isDefault;
      // Making a language the default always publishes it too — a default language that isn't
      // published would leave the storefront with no renderable default.
      if (input.isPublished !== undefined) data.isPublished = input.isPublished;
      if (input.isDefault === true) data.isPublished = true;
      return tx.storeLanguage.update({ where: { id }, data });
    });

    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "language.updated",
        resourceType: "store_language",
        resourceId: id,
        before: { isDefault: current.isDefault, isPublished: current.isPublished },
        after: input,
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "language.updated", { storeLanguageId: id });
    return this.toSummary(updated);
  }

  async remove(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    const current = await this.prisma.storeLanguage.findFirst({ where: { ...this.scope(ctx), id } });
    if (!current) throw new NotFoundError("Store language");
    if (current.isDefault) throw new ConflictError("Cannot delete the default language.");

    await this.prisma.storeLanguage.delete({ where: { id } });
    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "language.deleted",
        resourceType: "store_language",
        resourceId: id,
        before: { locale: current.locale },
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "language.deleted", { storeLanguageId: id });
  }
}
