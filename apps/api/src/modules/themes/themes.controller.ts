import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import {
  installThemeInputSchema,
  updateGlobalSettingsSchema,
  updateStoreThemeInputSchema,
  updateThemeTemplateInputSchema,
  type InstallThemeInput,
  type UpdateGlobalSettingsInput,
  type UpdateStoreThemeInput,
  type UpdateThemeTemplateInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { ThemesService } from "./themes.service";

@Controller("stores/:storeId/themes")
export class ThemesController {
  constructor(private readonly themes: ThemesService) {}

  @Get("catalog")
  @RequireStore("themes.read")
  catalog() {
    return this.themes.listCatalog();
  }

  @Get()
  @RequireStore("themes.read")
  list(@CurrentTenant() tenant: TenantContext) {
    return this.themes.listStoreThemes(tenant);
  }

  @Post()
  @RequireStore("themes.edit")
  install(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(installThemeInputSchema)) body: InstallThemeInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.themes.install(tenant, body, meta);
  }

  @Get(":storeThemeId")
  @RequireStore("themes.read")
  get(@CurrentTenant() tenant: TenantContext, @Param("storeThemeId") id: string) {
    return this.themes.getStoreTheme(tenant, id);
  }

  @Patch(":storeThemeId")
  @RequireStore("themes.edit")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("storeThemeId") id: string,
    @Body(new ZodValidationPipe(updateStoreThemeInputSchema)) body: UpdateStoreThemeInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.themes.updateStoreTheme(tenant, id, body, meta);
  }

  @Delete(":storeThemeId")
  @RequireStore("themes.edit")
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param("storeThemeId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.themes.removeStoreTheme(tenant, id, meta);
    return { ok: true };
  }

  @Get(":storeThemeId/versions/:versionId")
  @RequireStore("themes.read")
  getVersion(
    @CurrentTenant() tenant: TenantContext,
    @Param("storeThemeId") storeThemeId: string,
    @Param("versionId") versionId: string,
  ) {
    return this.themes.getVersion(tenant, storeThemeId, versionId);
  }

  @Patch(":storeThemeId/versions/:versionId/settings")
  @RequireStore("themes.edit")
  updateSettings(
    @CurrentTenant() tenant: TenantContext,
    @Param("storeThemeId") storeThemeId: string,
    @Param("versionId") versionId: string,
    @Body(new ZodValidationPipe(updateGlobalSettingsSchema)) body: UpdateGlobalSettingsInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.themes.updateGlobalSettings(tenant, storeThemeId, versionId, body, meta);
  }

  @Patch(":storeThemeId/versions/:versionId/templates/:templateType/:templateName")
  @RequireStore("themes.edit")
  updateTemplate(
    @CurrentTenant() tenant: TenantContext,
    @Param("storeThemeId") storeThemeId: string,
    @Param("versionId") versionId: string,
    @Param("templateType") templateType: string,
    @Param("templateName") templateName: string,
    @Body(new ZodValidationPipe(updateThemeTemplateInputSchema)) body: UpdateThemeTemplateInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.themes.updateTemplate(tenant, storeThemeId, versionId, templateType, templateName, body, meta);
  }

  @Post(":storeThemeId/versions/:versionId/publish")
  @RequireStore("themes.publish")
  publish(
    @CurrentTenant() tenant: TenantContext,
    @Param("storeThemeId") storeThemeId: string,
    @Param("versionId") versionId: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.themes.publish(tenant, storeThemeId, versionId, meta);
  }

  @Post(":storeThemeId/versions/:versionId/preview-token")
  @RequireStore("themes.read")
  mintPreviewToken(
    @CurrentTenant() tenant: TenantContext,
    @Param("storeThemeId") storeThemeId: string,
    @Param("versionId") versionId: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.themes.mintPreviewToken(tenant, storeThemeId, versionId, meta);
  }
}
