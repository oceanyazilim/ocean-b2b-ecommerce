import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import {
  metafieldDefinitionInputSchema,
  metafieldOwnerTypeSchema,
  updateMetafieldDefinitionSchema,
  z,
  type MetafieldDefinitionInput,
  type MetafieldOwnerType,
  type UpdateMetafieldDefinitionInput,
} from "@ocean/types";

import { CurrentTenant } from "../../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../../common/validation/zod-validation.pipe";
import { MetafieldsService } from "./metafields.service";

const listQuery = z.object({ ownerType: metafieldOwnerTypeSchema.optional() });

@Controller("stores/:storeId/metafield-definitions")
export class MetafieldDefinitionsController {
  constructor(private readonly metafields: MetafieldsService) {}

  @Get()
  @RequireStore("settings.read")
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listQuery)) query: { ownerType?: MetafieldOwnerType },
  ) {
    return this.metafields.listDefinitions(tenant, query.ownerType);
  }

  @Post()
  @RequireStore("settings.write")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(metafieldDefinitionInputSchema)) body: MetafieldDefinitionInput,
  ) {
    return this.metafields.createDefinition(tenant, body);
  }

  @Patch(":definitionId")
  @RequireStore("settings.write")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("definitionId") id: string,
    @Body(new ZodValidationPipe(updateMetafieldDefinitionSchema))
    body: UpdateMetafieldDefinitionInput,
  ) {
    return this.metafields.updateDefinition(tenant, id, body);
  }

  @Delete(":definitionId")
  @RequireStore("settings.write")
  @HttpCode(204)
  async remove(@CurrentTenant() tenant: TenantContext, @Param("definitionId") id: string) {
    await this.metafields.removeDefinition(tenant, id);
  }
}
