import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import {
  createInvoiceInputSchema,
  invoiceListQuerySchema,
  recordInvoicePaymentSchema,
  type CreateInvoiceInput,
  type InvoiceListQuery,
  type RecordInvoicePaymentInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { FinanceService } from "./finance.service";

@Controller("stores/:storeId/invoices")
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get()
  @RequireStore("finance.read")
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(invoiceListQuerySchema)) query: InvoiceListQuery,
  ) {
    return this.finance.list(tenant, query);
  }

  @Get(":invoiceId")
  @RequireStore("finance.read")
  get(@CurrentTenant() tenant: TenantContext, @Param("invoiceId") id: string) {
    return this.finance.get(tenant, id);
  }

  @Post()
  @RequireStore("finance.write")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createInvoiceInputSchema)) body: CreateInvoiceInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.finance.create(tenant, body, meta);
  }

  @Post(":invoiceId/payments")
  @RequireStore("finance.write")
  recordPayment(
    @CurrentTenant() tenant: TenantContext,
    @Param("invoiceId") id: string,
    @Body(new ZodValidationPipe(recordInvoicePaymentSchema)) body: RecordInvoicePaymentInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.finance.recordPayment(tenant, id, body, meta);
  }
}
