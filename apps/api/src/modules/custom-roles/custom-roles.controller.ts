import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import {
  createCustomRoleInputSchema,
  updateCustomRoleInputSchema,
  type CreateCustomRoleInput,
  type UpdateCustomRoleInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { CustomRolesService } from "./custom-roles.service";

@Controller("stores/:storeId/custom-roles")
@RequireStore("users.manage")
export class CustomRolesController {
  constructor(private readonly roles: CustomRolesService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.roles.list(tenant);
  }

  @Post()
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createCustomRoleInputSchema)) body: CreateCustomRoleInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.roles.create(tenant, body, meta);
  }

  @Patch(":id")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCustomRoleInputSchema)) body: UpdateCustomRoleInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.roles.update(tenant, id, body, meta);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentTenant() tenant: TenantContext, @Param("id") id: string, @ReqMeta() meta: RequestMeta) {
    await this.roles.remove(tenant, id, meta);
  }
}
