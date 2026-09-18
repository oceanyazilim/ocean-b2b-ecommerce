import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import {
  createStoreThemeInputSchema,
  updateStoreThemeInputSchema,
  type CreateStoreThemeInput,
  type UpdateStoreThemeInput,
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

  @Get()
  @RequireStore("themes.read")
  list(@CurrentTenant() tenant: TenantContext) {
    return this.themes.listStoreThemes(tenant);
  }

  @Get(":themeId")
  @RequireStore("themes.read")
  get(@CurrentTenant() tenant: TenantContext, @Param("themeId") id: string) {
    return this.themes.getStoreTheme(tenant, id);
  }

  @Post()
  @RequireStore("themes.edit")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createStoreThemeInputSchema)) body: CreateStoreThemeInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.themes.createStoreTheme(tenant, body, meta);
  }

  @Patch(":themeId")
  @RequireStore("themes.edit")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("themeId") id: string,
    @Body(new ZodValidationPipe(updateStoreThemeInputSchema)) body: UpdateStoreThemeInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.themes.updateStoreTheme(tenant, id, body, meta);
  }
}
