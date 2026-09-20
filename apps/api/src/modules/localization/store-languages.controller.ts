import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import {
  storeLanguageInputSchema,
  updateStoreLanguageSchema,
  type StoreLanguageInput,
  type UpdateStoreLanguageInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { StoreLanguagesService } from "./store-languages.service";

@Controller("stores/:storeId/languages")
export class StoreLanguagesController {
  constructor(private readonly languages: StoreLanguagesService) {}

  @Get()
  @RequireStore("settings.read")
  list(@CurrentTenant() tenant: TenantContext) {
    return this.languages.list(tenant);
  }

  @Post()
  @RequireStore("settings.write")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(storeLanguageInputSchema)) body: StoreLanguageInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.languages.create(tenant, body, meta);
  }

  @Patch(":languageId")
  @RequireStore("settings.write")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("languageId") id: string,
    @Body(new ZodValidationPipe(updateStoreLanguageSchema)) body: UpdateStoreLanguageInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.languages.update(tenant, id, body, meta);
  }

  @Delete(":languageId")
  @RequireStore("settings.write")
  @HttpCode(204)
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param("languageId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.languages.remove(tenant, id, meta);
  }
}
