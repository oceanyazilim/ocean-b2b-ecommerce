import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import {
  categoryInputSchema,
  updateCategorySchema,
  type CategoryInput,
  type UpdateCategoryInput,
} from "@ocean/types";

import { CurrentTenant } from "../../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe";
import { CategoriesService } from "./categories.service";

@Controller("stores/:storeId/categories")
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @RequireStore("products.read")
  tree(@CurrentTenant() tenant: TenantContext) {
    return this.categories.tree(tenant);
  }

  @Post()
  @RequireStore("products.write")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(categoryInputSchema)) body: CategoryInput,
  ) {
    return this.categories.create(tenant, body);
  }

  @Patch(":categoryId")
  @RequireStore("products.write")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("categoryId") id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) body: UpdateCategoryInput,
  ) {
    return this.categories.update(tenant, id, body);
  }

  @Delete(":categoryId")
  @RequireStore("products.write")
  @HttpCode(204)
  async remove(@CurrentTenant() tenant: TenantContext, @Param("categoryId") id: string) {
    await this.categories.remove(tenant, id);
  }
}
