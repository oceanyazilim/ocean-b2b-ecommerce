import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import crypto from "crypto";

import { ConflictError, NotFoundError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { EventsService } from "../events/events.service";

import type {
  StoreThemeSummary,
  StoreThemeVersion,
  ThemeTemplateVersion,
  CreateStoreThemeInput,
  UpdateStoreThemeInput,
} from "@ocean/types";

type StoreThemeRow = Prisma.StoreThemeGetPayload<Record<string, never>>;
type StoreThemeVersionRow = Prisma.StoreThemeVersionGetPayload<Record<string, never>>;
type TemplateVersionRow = Prisma.ThemeTemplateVersionGetPayload<Record<string, never>>;

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";

@Injectable()
export class ThemesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  private scope(ctx: TenantContext): Prisma.StoreThemeWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId };
  }

  private toStoreThemeSummary(row: StoreThemeRow): StoreThemeSummary {
    return {
      id: row.id,
      name: row.name,
      role: row.role,
      publishedVersionId: row.publishedVersionId,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toStoreThemeVersion(row: StoreThemeVersionRow): StoreThemeVersion {
    return {
      id: row.id,
      number: row.number,
      globalSettings: row.globalSettings,
      status: row.status,
      etag: row.etag,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toTemplateVersion(row: TemplateVersionRow): ThemeTemplateVersion {
    return {
      id: row.id,
      templateType: row.templateType,
      templateName: row.templateName,
      configuration: row.configuration,
    };
  }

  async listStoreThemes(ctx: TenantContext): Promise<StoreThemeSummary[]> {
    const rows = await this.prisma.storeTheme.findMany({
      where: this.scope(ctx),
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => this.toStoreThemeSummary(r));
  }

  async getStoreTheme(ctx: TenantContext, id: string): Promise<StoreThemeSummary> {
    const row = await this.prisma.storeTheme.findFirst({
      where: { ...this.scope(ctx), id },
    });
    if (!row) throw new NotFoundError("StoreTheme");
    return this.toStoreThemeSummary(row);
  }

  async createStoreTheme(
    ctx: TenantContext,
    input: CreateStoreThemeInput,
    meta: RequestMeta,
  ): Promise<StoreThemeSummary> {
    const theme = await this.prisma.theme.findUnique({ where: { id: input.themeId } });
    if (!theme) throw new NotFoundError("Theme");

    const created = await this.prisma.storeTheme.create({
      data: {
        storeId: ctx.storeId as string,
        organizationId: ctx.organizationId,
        themeId: input.themeId,
        themeReleaseId: input.themeReleaseId,
        name: input.name || theme.name,
        role: "unpublished",
      },
    });

    // Create initial version
    await this.prisma.storeThemeVersion.create({
      data: {
        storeId: ctx.storeId as string,
        organizationId: ctx.organizationId,
        storeThemeId: created.id,
        number: 1,
        etag: crypto.randomBytes(16).toString("hex"),
        createdBy: ctx.actor.id,
      },
    });

    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "theme.installed",
        resourceType: "storeTheme",
        resourceId: created.id,
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "theme.installed", { storeThemeId: created.id });

    return this.toStoreThemeSummary(created);
  }

  async updateStoreTheme(
    ctx: TenantContext,
    id: string,
    input: UpdateStoreThemeInput,
    meta: RequestMeta,
  ): Promise<StoreThemeSummary> {
    const current = await this.prisma.storeTheme.findFirst({
      where: { ...this.scope(ctx), id },
    });
    if (!current) throw new NotFoundError("StoreTheme");

    if (input.role === "main" && current.role !== "main") {
      // Must demote other main theme
      await this.prisma.$transaction([
        this.prisma.storeTheme.updateMany({
          where: { ...this.scope(ctx), role: "main" },
          data: { role: "unpublished" },
        }),
        this.prisma.storeTheme.update({
          where: { id },
          data: { role: "main", publishedAt: new Date() },
        }),
      ]);
    } else if (input.name) {
      await this.prisma.storeTheme.update({
        where: { id },
        data: { name: input.name },
      });
    }

    const updated = await this.prisma.storeTheme.findUniqueOrThrow({ where: { id } });

    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "theme.updated",
        resourceType: "storeTheme",
        resourceId: id,
        meta,
      },
      this.prisma,
    );

    return this.toStoreThemeSummary(updated);
  }

  async getPublishedTheme(ctx: TenantContext): Promise<StoreThemeSummary | null> {
    const row = await this.prisma.storeTheme.findFirst({
      where: { ...this.scope(ctx), role: "main" },
    });
    return row ? this.toStoreThemeSummary(row) : null;
  }
}
