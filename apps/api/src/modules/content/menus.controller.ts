import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import {
  menuInputSchema,
  updateMenuSchema,
  type MenuInput,
  type UpdateMenuInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { ContentService } from "./content.service";

@Controller("stores/:storeId/menus")
export class MenusController {
  constructor(private readonly content: ContentService) {}

  @Get()
  @RequireStore("content.read")
  list(@CurrentTenant() tenant: TenantContext) {
    return this.content.listMenus(tenant);
  }
  
  @Get(":menuId")
  @RequireStore("content.read")
  get(
    @CurrentTenant() tenant: TenantContext,
    @Param("menuId") id: string,
  ) {
    return this.content.getMenu(tenant, id);
  }

  @Post()
  @RequireStore("content.write")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(menuInputSchema)) body: MenuInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.content.createMenu(tenant, body, meta);
  }
}
