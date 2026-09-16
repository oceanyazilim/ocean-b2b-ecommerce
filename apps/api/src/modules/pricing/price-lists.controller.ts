import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import {
  assignmentTargetSchema,
  createPriceListSchema,
  cursorPaginationQuerySchema,
  priceListListQuerySchema,
  removePriceListPricesSchema,
  setPriceListPricesSchema,
  updatePriceListSchema,
  z,
  type AssignmentTargetInput,
  type CreatePriceListInput,
  type PriceListListQuery,
  type RemovePriceListPricesInput,
  type SetPriceListPricesInput,
  type UpdatePriceListInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { PriceListsService } from "./price-lists.service";

const pricesQuerySchema = cursorPaginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
});
type PricesQuery = z.infer<typeof pricesQuerySchema>;

@Controller("stores/:storeId/price-lists")
export class PriceListsController {
  constructor(private readonly priceLists: PriceListsService) {}

  @Get()
  @RequireStore("pricing.read")
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(priceListListQuerySchema)) query: PriceListListQuery,
  ) {
    return this.priceLists.list(tenant, query);
  }

  @Post()
  @RequireStore("pricing.write")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createPriceListSchema)) body: CreatePriceListInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.priceLists.create(tenant, body, meta);
  }

  @Get(":priceListId")
  @RequireStore("pricing.read")
  get(@CurrentTenant() tenant: TenantContext, @Param("priceListId") id: string) {
    return this.priceLists.get(tenant, id);
  }

  @Patch(":priceListId")
  @RequireStore("pricing.write")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("priceListId") id: string,
    @Body(new ZodValidationPipe(updatePriceListSchema)) body: UpdatePriceListInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.priceLists.update(tenant, id, body, meta);
  }

  @Delete(":priceListId")
  @RequireStore("pricing.write")
  @HttpCode(204)
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param("priceListId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.priceLists.remove(tenant, id, meta);
  }

  @Get(":priceListId/prices")
  @RequireStore("pricing.read")
  listPrices(
    @CurrentTenant() tenant: TenantContext,
    @Param("priceListId") id: string,
    @Query(new ZodValidationPipe(pricesQuerySchema)) query: PricesQuery,
  ) {
    return this.priceLists.listPrices(tenant, id, query);
  }

  @Put(":priceListId/prices")
  @RequireStore("pricing.write")
  setPrices(
    @CurrentTenant() tenant: TenantContext,
    @Param("priceListId") id: string,
    @Body(new ZodValidationPipe(setPriceListPricesSchema)) body: SetPriceListPricesInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.priceLists.setPrices(tenant, id, body, meta);
  }

  @Post(":priceListId/prices/remove")
  @RequireStore("pricing.write")
  @HttpCode(200)
  removePrices(
    @CurrentTenant() tenant: TenantContext,
    @Param("priceListId") id: string,
    @Body(new ZodValidationPipe(removePriceListPricesSchema)) body: RemovePriceListPricesInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.priceLists.removePrices(tenant, id, body.variantIds, meta);
  }

  @Post(":priceListId/assignments")
  @RequireStore("pricing.write")
  addAssignment(
    @CurrentTenant() tenant: TenantContext,
    @Param("priceListId") id: string,
    @Body(new ZodValidationPipe(assignmentTargetSchema)) body: AssignmentTargetInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.priceLists.addAssignment(tenant, id, body, meta);
  }

  @Delete(":priceListId/assignments/:assignmentId")
  @RequireStore("pricing.write")
  @HttpCode(204)
  async removeAssignment(
    @CurrentTenant() tenant: TenantContext,
    @Param("priceListId") id: string,
    @Param("assignmentId") assignmentId: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.priceLists.removeAssignment(tenant, id, assignmentId, meta);
  }
}
