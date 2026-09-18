import { randomBytes } from "node:crypto";

import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type {
  InstallThemeInput,
  ResolvedTheme,
  StoreThemeDetail,
  StoreThemeSummary,
  StoreThemeVersionDetail,
  TemplateConfiguration,
  ThemeCatalogEntry,
  ThemeManifest,
  ThemeTemplateVersion,
  UpdateGlobalSettingsInput,
  UpdateStoreThemeInput,
  UpdateThemeTemplateInput,
} from "@ocean/types";

import { ConflictError, NotFoundError, ValidationError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { EventsService } from "../events/events.service";
import { hashToken } from "../users/user-token.service";

const storeThemeInclude = {
  theme: true,
  release: true,
  versions: { orderBy: { number: "desc" as const } },
};
type StoreThemeRow = Prisma.StoreThemeGetPayload<{ include: typeof storeThemeInclude }>;

const versionInclude = { templates: true };
type VersionRow = Prisma.StoreThemeVersionGetPayload<{ include: typeof versionInclude }>;

const manifestOf = (release: { manifest: Prisma.JsonValue }): ThemeManifest =>
  release.manifest as unknown as ThemeManifest;

// A theme is a manifest (declares templates/sections/blocks and their settings) plus, once
// installed on a store, a working draft version staff edit and a published version the
// storefront actually serves. Editing never touches the published version directly — publish
// snapshots the draft and immediately opens a new one, so the storefront is never mid-edit.
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

  // ---- global catalog -------------------------------------------------------------------------

  async listCatalog(): Promise<ThemeCatalogEntry[]> {
    const themes = await this.prisma.theme.findMany({
      where: { status: "active" },
      include: { releases: { orderBy: { releasedAt: "desc" }, take: 1 } },
      orderBy: { name: "asc" },
    });
    return themes.map((t) => {
      const latest = t.releases[0];
      return {
        id: t.id,
        slug: t.slug,
        name: t.name,
        description: t.description,
        category: t.category,
        status: t.status,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        latestRelease: latest
          ? {
              id: latest.id,
              version: latest.version,
              manifest: manifestOf(latest),
              releasedAt: latest.releasedAt.toISOString(),
            }
          : null,
      };
    });
  }

  // ---- store installs ---------------------------------------------------------------------

  private toStoreThemeSummary(row: Pick<StoreThemeRow, "id" | "name" | "role" | "publishedVersionId" | "publishedAt" | "createdAt" | "updatedAt">): StoreThemeSummary {
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

  private toStoreThemeDetail(row: StoreThemeRow): StoreThemeDetail {
    return {
      ...this.toStoreThemeSummary(row),
      themeId: row.themeId,
      themeName: row.theme.name,
      releaseId: row.themeReleaseId,
      manifest: manifestOf(row.release),
      versions: row.versions.map((v) => ({
        id: v.id,
        number: v.number,
        status: v.status,
        publishedAt: v.publishedAt?.toISOString() ?? null,
      })),
    };
  }

  async listStoreThemes(ctx: TenantContext): Promise<StoreThemeSummary[]> {
    const rows = await this.prisma.storeTheme.findMany({
      where: this.scope(ctx),
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => this.toStoreThemeSummary(r));
  }

  async getStoreTheme(ctx: TenantContext, id: string): Promise<StoreThemeDetail> {
    const row = await this.prisma.storeTheme.findFirst({
      where: { ...this.scope(ctx), id },
      include: storeThemeInclude,
    });
    if (!row) throw new NotFoundError("Store theme");
    return this.toStoreThemeDetail(row);
  }

  async install(
    ctx: TenantContext,
    input: InstallThemeInput,
    meta: RequestMeta,
  ): Promise<StoreThemeDetail> {
    const storeId = ctx.storeId as string;
    const theme = await this.prisma.theme.findFirst({ where: { id: input.themeId, status: "active" } });
    if (!theme) throw new NotFoundError("Theme");
    const release = input.releaseId
      ? await this.prisma.themeRelease.findFirst({ where: { id: input.releaseId, themeId: theme.id } })
      : await this.prisma.themeRelease.findFirst({
          where: { themeId: theme.id },
          orderBy: { releasedAt: "desc" },
        });
    if (!release) throw new NotFoundError("Theme release");
    const manifest = manifestOf(release);

    const id = await this.prisma.$transaction(async (tx) => {
      const storeTheme = await tx.storeTheme.create({
        data: {
          storeId,
          organizationId: ctx.organizationId,
          themeId: theme.id,
          themeReleaseId: release.id,
          name: input.name?.trim() || theme.name,
          role: "unpublished",
        },
      });
      const globalDefaults = Object.fromEntries(
        manifest.globalSettings.map((f) => [f.key, f.default ?? null]),
      );
      const version = await tx.storeThemeVersion.create({
        data: {
          storeId,
          organizationId: ctx.organizationId,
          storeThemeId: storeTheme.id,
          number: 1,
          globalSettings: globalDefaults as Prisma.InputJsonValue,
          status: "draft",
          etag: randomBytes(16).toString("hex"),
          createdBy: ctx.actor.type === "user" ? ctx.actor.id : null,
        },
      });
      await tx.themeTemplateVersion.createMany({
        data: manifest.templates.map((t) => ({
          themeVersionId: version.id,
          templateType: t.type,
          templateName: "default",
          configuration: { sections: {}, sectionOrder: [] } as Prisma.InputJsonValue,
        })),
      });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId,
          actorId: ctx.actor.id,
          action: "theme.installed",
          resourceType: "storeTheme",
          resourceId: storeTheme.id,
          after: { themeId: theme.id, releaseId: release.id },
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "theme.installed", { storeThemeId: storeTheme.id }, tx);
      return storeTheme.id;
    });
    return this.getStoreTheme(ctx, id);
  }

  async updateStoreTheme(
    ctx: TenantContext,
    id: string,
    input: UpdateStoreThemeInput,
    meta: RequestMeta,
  ): Promise<StoreThemeDetail> {
    const current = await this.prisma.storeTheme.findFirst({ where: { ...this.scope(ctx), id } });
    if (!current) throw new NotFoundError("Store theme");
    if (input.name !== undefined) {
      await this.prisma.storeTheme.update({ where: { id }, data: { name: input.name } });
    }
    await this.audit.record({
      organizationId: ctx.organizationId,
      storeId: ctx.storeId,
      actorId: ctx.actor.id,
      action: "theme.updated",
      resourceType: "storeTheme",
      resourceId: id,
      meta,
    });
    return this.getStoreTheme(ctx, id);
  }

  async removeStoreTheme(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    const current = await this.prisma.storeTheme.findFirst({ where: { ...this.scope(ctx), id } });
    if (!current) throw new NotFoundError("Store theme");
    if (current.role === "main") {
      throw new ConflictError("Publish a different theme before removing this one.");
    }
    await this.prisma.storeTheme.delete({ where: { id } });
    await this.audit.record({
      organizationId: ctx.organizationId,
      storeId: ctx.storeId,
      actorId: ctx.actor.id,
      action: "theme.removed",
      resourceType: "storeTheme",
      resourceId: id,
      meta,
    });
  }

  // ---- versions & editing ---------------------------------------------------------------------

  private toVersionDetail(row: VersionRow): StoreThemeVersionDetail {
    return {
      id: row.id,
      number: row.number,
      globalSettings: (row.globalSettings as Record<string, unknown>) ?? {},
      status: row.status,
      etag: row.etag,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      templates: row.templates.map((t) => this.toTemplateVersion(t)),
    };
  }

  private toTemplateVersion(row: Prisma.ThemeTemplateVersionGetPayload<Record<string, never>>): ThemeTemplateVersion {
    return {
      id: row.id,
      templateType: row.templateType,
      templateName: row.templateName,
      configuration: row.configuration as unknown as TemplateConfiguration,
    };
  }

  private async requireStoreTheme(ctx: TenantContext, storeThemeId: string): Promise<StoreThemeRow> {
    const row = await this.prisma.storeTheme.findFirst({
      where: { ...this.scope(ctx), id: storeThemeId },
      include: storeThemeInclude,
    });
    if (!row) throw new NotFoundError("Store theme");
    return row;
  }

  async getVersion(
    ctx: TenantContext,
    storeThemeId: string,
    versionId: string,
  ): Promise<StoreThemeVersionDetail> {
    await this.requireStoreTheme(ctx, storeThemeId);
    const row = await this.prisma.storeThemeVersion.findFirst({
      where: { id: versionId, storeThemeId },
      include: versionInclude,
    });
    if (!row) throw new NotFoundError("Theme version");
    return this.toVersionDetail(row);
  }

  private async requireDraftVersion(storeThemeId: string, versionId: string) {
    const version = await this.prisma.storeThemeVersion.findFirst({
      where: { id: versionId, storeThemeId },
    });
    if (!version) throw new NotFoundError("Theme version");
    if (version.status !== "draft") {
      throw new ConflictError("Only a draft version can be edited.");
    }
    return version;
  }

  async updateGlobalSettings(
    ctx: TenantContext,
    storeThemeId: string,
    versionId: string,
    input: UpdateGlobalSettingsInput,
    meta: RequestMeta,
  ): Promise<StoreThemeVersionDetail> {
    const storeTheme = await this.requireStoreTheme(ctx, storeThemeId);
    await this.requireDraftVersion(storeThemeId, versionId);
    const manifest = manifestOf(storeTheme.release);
    const allowedKeys = new Set(manifest.globalSettings.map((f) => f.key));
    for (const key of Object.keys(input.globalSettings)) {
      if (!allowedKeys.has(key)) {
        throw new ValidationError(`Unknown global setting "${key}" for this theme.`, [
          { path: `globalSettings.${key}`, message: "Not declared in the theme manifest" },
        ]);
      }
    }
    await this.prisma.storeThemeVersion.update({
      where: { id: versionId },
      data: {
        globalSettings: input.globalSettings as Prisma.InputJsonValue,
        etag: randomBytes(16).toString("hex"),
      },
    });
    await this.audit.record({
      organizationId: ctx.organizationId,
      storeId: ctx.storeId,
      actorId: ctx.actor.id,
      action: "theme.settings_updated",
      resourceType: "storeThemeVersion",
      resourceId: versionId,
      meta,
    });
    return this.getVersion(ctx, storeThemeId, versionId);
  }

  private validateConfiguration(manifest: ThemeManifest, templateType: string, config: TemplateConfiguration) {
    const template = manifest.templates.find((t) => t.type === templateType);
    if (!template) {
      throw new ValidationError(`"${templateType}" is not a template in this theme.`);
    }
    const sectionsByType = new Map(manifest.sections.map((s) => [s.type, s]));
    for (const sectionId of config.sectionOrder) {
      const instance = config.sections[sectionId];
      if (!instance) {
        throw new ValidationError(`sectionOrder references unknown section "${sectionId}".`);
      }
      const sectionManifest = sectionsByType.get(instance.type);
      if (!sectionManifest) {
        throw new ValidationError(`"${instance.type}" is not a section type in this theme.`);
      }
      if (template.sections.length > 0 && !template.sections.includes(instance.type)) {
        throw new ValidationError(`Section "${instance.type}" is not allowed on template "${templateType}".`);
      }
      for (const blockId of instance.blockOrder) {
        const block = instance.blocks[blockId];
        if (!block) {
          throw new ValidationError(`blockOrder references unknown block "${blockId}".`);
        }
        if (!sectionManifest.blocks.includes(block.type)) {
          throw new ValidationError(`Block "${block.type}" is not allowed in section "${instance.type}".`);
        }
      }
    }
  }

  async updateTemplate(
    ctx: TenantContext,
    storeThemeId: string,
    versionId: string,
    templateType: string,
    templateName: string,
    input: UpdateThemeTemplateInput,
    meta: RequestMeta,
  ): Promise<ThemeTemplateVersion> {
    const storeTheme = await this.requireStoreTheme(ctx, storeThemeId);
    await this.requireDraftVersion(storeThemeId, versionId);
    const manifest = manifestOf(storeTheme.release);
    this.validateConfiguration(manifest, templateType, input.configuration);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.themeTemplateVersion.upsert({
        where: { themeVersionId_templateType_templateName: { themeVersionId: versionId, templateType, templateName } },
        update: { configuration: input.configuration as Prisma.InputJsonValue },
        create: {
          themeVersionId: versionId,
          templateType,
          templateName,
          configuration: input.configuration as Prisma.InputJsonValue,
        },
      });
      await tx.storeThemeVersion.update({
        where: { id: versionId },
        data: { etag: randomBytes(16).toString("hex") },
      });
      return row;
    });
    await this.audit.record({
      organizationId: ctx.organizationId,
      storeId: ctx.storeId,
      actorId: ctx.actor.id,
      action: "theme.template_updated",
      resourceType: "storeThemeVersion",
      resourceId: versionId,
      after: { templateType, templateName },
      meta,
    });
    return this.toTemplateVersion(updated);
  }

  // Publishing snapshots the draft as the live version and immediately opens a fresh draft
  // (cloned from it) so editing continues without ever touching what the storefront serves.
  async publish(
    ctx: TenantContext,
    storeThemeId: string,
    versionId: string,
    meta: RequestMeta,
  ): Promise<StoreThemeSummary> {
    const storeId = ctx.storeId as string;
    await this.requireStoreTheme(ctx, storeThemeId);
    const version = await this.requireDraftVersion(storeThemeId, versionId);
    const templates = await this.prisma.themeTemplateVersion.findMany({ where: { themeVersionId: versionId } });

    await this.prisma.$transaction(async (tx) => {
      await tx.storeThemeVersion.update({
        where: { id: versionId },
        data: { status: "published", publishedAt: new Date() },
      });
      await tx.storeTheme.updateMany({
        where: { storeId, role: "main" },
        data: { role: "unpublished" },
      });
      await tx.storeTheme.update({
        where: { id: storeThemeId },
        data: { role: "main", publishedVersionId: versionId, publishedAt: new Date() },
      });
      const nextVersion = await tx.storeThemeVersion.create({
        data: {
          storeId,
          organizationId: ctx.organizationId,
          storeThemeId,
          number: version.number + 1,
          globalSettings: version.globalSettings as Prisma.InputJsonValue,
          status: "draft",
          etag: randomBytes(16).toString("hex"),
          createdBy: ctx.actor.type === "user" ? ctx.actor.id : null,
        },
      });
      if (templates.length) {
        await tx.themeTemplateVersion.createMany({
          data: templates.map((t) => ({
            themeVersionId: nextVersion.id,
            templateType: t.templateType,
            templateName: t.templateName,
            configuration: t.configuration as Prisma.InputJsonValue,
          })),
        });
      }
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId,
          actorId: ctx.actor.id,
          action: "theme.published",
          resourceType: "storeTheme",
          resourceId: storeThemeId,
          after: { versionId },
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "theme.published", { storeThemeId, versionId }, tx);
    });
    return this.getStoreTheme(ctx, storeThemeId).then((d) => d);
  }

  // ---- storefront-facing --------------------------------------------------------------------

  private resolveTheme(storeThemeId: string, version: VersionRow): ResolvedTheme {
    const templates: Record<string, TemplateConfiguration> = {};
    for (const t of version.templates) {
      templates[`${t.templateType}.${t.templateName}`] = t.configuration as unknown as TemplateConfiguration;
    }
    return {
      storeThemeId,
      versionId: version.id,
      globalSettings: (version.globalSettings as Record<string, unknown>) ?? {},
      templates,
    };
  }

  async getPublishedTheme(ctx: TenantContext): Promise<ResolvedTheme | null> {
    const storeTheme = await this.prisma.storeTheme.findFirst({
      where: { ...this.scope(ctx), role: "main" },
    });
    if (!storeTheme?.publishedVersionId) return null;
    const version = await this.prisma.storeThemeVersion.findUnique({
      where: { id: storeTheme.publishedVersionId },
      include: versionInclude,
    });
    if (!version) return null;
    return this.resolveTheme(storeTheme.id, version);
  }

  // ---- preview (Phase 10 editor live-preview iframe) -----------------------------------------

  // A short-lived, hashed-at-rest token that lets the storefront app render one specific
  // (usually still-a-draft) version regardless of publish state — the editor's iframe carries
  // it so edits are visible before publishing, without giving the storefront app the admin's
  // own session. Minting a new token for a version doesn't invalidate earlier ones; they just
  // expire on their own.
  async mintPreviewToken(
    ctx: TenantContext,
    storeThemeId: string,
    versionId: string,
    meta: RequestMeta,
  ): Promise<{ token: string; expiresAt: string }> {
    await this.requireStoreTheme(ctx, storeThemeId);
    const version = await this.prisma.storeThemeVersion.findFirst({ where: { id: versionId, storeThemeId } });
    if (!version) throw new NotFoundError("Theme version");

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.prisma.themePreviewToken.create({
      data: { storeThemeVersionId: versionId, tokenHash: hashToken(token), expiresAt },
    });
    await this.audit.record({
      organizationId: ctx.organizationId,
      storeId: ctx.storeId,
      actorId: ctx.actor.id,
      action: "theme.preview_token_minted",
      resourceType: "storeThemeVersion",
      resourceId: versionId,
      meta,
    });
    return { token, expiresAt: expiresAt.toISOString() };
  }

  async resolvePreviewTheme(token: string): Promise<ResolvedTheme | null> {
    const row = await this.prisma.themePreviewToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { version: { include: versionInclude } },
    });
    if (!row || row.expiresAt.getTime() < Date.now()) return null;
    return this.resolveTheme(row.version.storeThemeId, row.version);
  }
}
