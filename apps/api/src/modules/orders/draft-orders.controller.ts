import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  createDraftOrderSchema,
  draftOrderListQuerySchema,
  updateDraftOrderSchema,
  type CreateDraftOrderInput,
  type DraftOrderListQuery,
  type UpdateDraftOrderInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { DraftOrdersService } from "./draft-orders.service";

@Controller("stores/:storeId/draft-orders")
export class DraftOrdersController {
  constructor(private readonly drafts: DraftOrdersService) {}

  @Get()
  @RequireStore("orders.read")
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(draftOrderListQuerySchema)) query: DraftOrderListQuery,
  ) {
    return this.drafts.list(tenant, query);
  }

  @Post()
  @RequireStore("orders.write")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createDraftOrderSchema)) body: CreateDraftOrderInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.drafts.create(tenant, body, meta);
  }

  @Get(":draftId")
  @RequireStore("orders.read")
  get(@CurrentTenant() tenant: TenantContext, @Param("draftId") id: string) {
    return this.drafts.get(tenant, id);
  }

  @Patch(":draftId")
  @RequireStore("orders.write")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("draftId") id: string,
    @Body(new ZodValidationPipe(updateDraftOrderSchema)) body: UpdateDraftOrderInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.drafts.update(tenant, id, body, meta);
  }

  @Post(":draftId/complete")
  @RequireStore("orders.write")
  complete(
    @CurrentTenant() tenant: TenantContext,
    @Param("draftId") id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.drafts.complete(tenant, id, idempotencyKey ?? null, meta);
  }

  @Post(":draftId/cancel")
  @RequireStore("orders.write")
  @HttpCode(200)
  cancel(
    @CurrentTenant() tenant: TenantContext,
    @Param("draftId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.drafts.cancel(tenant, id, meta);
  }
}
