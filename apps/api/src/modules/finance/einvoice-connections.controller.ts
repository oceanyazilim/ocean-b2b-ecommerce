import { Body, Controller, Get, Put } from "@nestjs/common";
import { upsertEInvoiceConnectionSchema, type UpsertEInvoiceConnectionInput } from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { EInvoiceConnectionsService } from "./einvoice-connections.service";

// E-invoicing provider connections (spec section 29) — a config surface, never a live
// integration; see EInvoiceConnectionsService's comment.
@Controller("stores/:storeId/invoicing/connections")
export class EInvoiceConnectionsController {
  constructor(private readonly connections: EInvoiceConnectionsService) {}

  @Get()
  @RequireStore("finance.read")
  list(@CurrentTenant() tenant: TenantContext) {
    return this.connections.list(tenant);
  }

  @Put()
  @RequireStore("finance.write")
  upsert(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(upsertEInvoiceConnectionSchema)) body: UpsertEInvoiceConnectionInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.connections.upsert(tenant, body, meta);
  }
}
