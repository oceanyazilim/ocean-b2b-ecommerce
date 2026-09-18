import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import {
  createQuoteInputSchema,
  declineQuoteSchema,
  quoteListQuerySchema,
  updateQuoteInputSchema,
  type CreateQuoteInput,
  type DeclineQuoteInput,
  type QuoteListQuery,
  type UpdateQuoteInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { QuotesService } from "./quotes.service";

@Controller("stores/:storeId/quotes")
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Get()
  @RequireStore("quotes.read")
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(quoteListQuerySchema)) query: QuoteListQuery,
  ) {
    return this.quotes.list(tenant, query);
  }

  @Get(":quoteId")
  @RequireStore("quotes.read")
  get(@CurrentTenant() tenant: TenantContext, @Param("quoteId") id: string) {
    return this.quotes.get(tenant, id);
  }

  @Post()
  @RequireStore("quotes.write")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createQuoteInputSchema)) body: CreateQuoteInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.quotes.create(tenant, body, meta);
  }

  @Patch(":quoteId")
  @RequireStore("quotes.write")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("quoteId") id: string,
    @Body(new ZodValidationPipe(updateQuoteInputSchema)) body: UpdateQuoteInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.quotes.update(tenant, id, body, meta);
  }

  @Post(":quoteId/send")
  @RequireStore("quotes.write")
  @HttpCode(200)
  send(
    @CurrentTenant() tenant: TenantContext,
    @Param("quoteId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.quotes.send(tenant, id, meta);
  }

  @Post(":quoteId/accept")
  @RequireStore("quotes.write")
  @HttpCode(200)
  accept(
    @CurrentTenant() tenant: TenantContext,
    @Param("quoteId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.quotes.accept(tenant, id, meta);
  }

  @Post(":quoteId/decline")
  @RequireStore("quotes.write")
  @HttpCode(200)
  decline(
    @CurrentTenant() tenant: TenantContext,
    @Param("quoteId") id: string,
    @Body(new ZodValidationPipe(declineQuoteSchema)) body: DeclineQuoteInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.quotes.decline(tenant, id, body, meta);
  }

  @Post(":quoteId/expire")
  @RequireStore("quotes.write")
  @HttpCode(200)
  expire(
    @CurrentTenant() tenant: TenantContext,
    @Param("quoteId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.quotes.expire(tenant, id, meta);
  }

  @Post(":quoteId/convert")
  @RequireStore("quotes.write")
  convert(
    @CurrentTenant() tenant: TenantContext,
    @Param("quoteId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.quotes.convert(tenant, id, meta);
  }
}
