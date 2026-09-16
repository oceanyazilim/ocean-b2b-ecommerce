import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import {
  cancelOrderSchema,
  orderListQuerySchema,
  orderNoteSchema,
  updateOrderSchema,
  type CancelOrderInput,
  type OrderListQuery,
  type OrderNoteInput,
  type UpdateOrderInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { OrdersService } from "./orders.service";

@Controller("stores/:storeId/orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @RequireStore("orders.read")
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(orderListQuerySchema)) query: OrderListQuery,
  ) {
    return this.orders.list(tenant, query);
  }

  @Get("stats")
  @RequireStore("orders.read")
  stats(@CurrentTenant() tenant: TenantContext) {
    return this.orders.stats(tenant);
  }

  @Get(":orderId")
  @RequireStore("orders.read")
  get(@CurrentTenant() tenant: TenantContext, @Param("orderId") id: string) {
    return this.orders.get(tenant, id);
  }

  @Patch(":orderId")
  @RequireStore("orders.write")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("orderId") id: string,
    @Body(new ZodValidationPipe(updateOrderSchema)) body: UpdateOrderInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.orders.update(tenant, id, body, meta);
  }

  @Post(":orderId/notes")
  @RequireStore("orders.write")
  @HttpCode(200)
  addNote(
    @CurrentTenant() tenant: TenantContext,
    @Param("orderId") id: string,
    @Body(new ZodValidationPipe(orderNoteSchema)) body: OrderNoteInput,
  ) {
    return this.orders.addNote(tenant, id, body.message);
  }

  @Post(":orderId/cancel")
  @RequireStore("orders.write")
  @HttpCode(200)
  cancel(
    @CurrentTenant() tenant: TenantContext,
    @Param("orderId") id: string,
    @Body(new ZodValidationPipe(cancelOrderSchema)) body: CancelOrderInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.orders.cancel(tenant, id, body, meta);
  }
}
