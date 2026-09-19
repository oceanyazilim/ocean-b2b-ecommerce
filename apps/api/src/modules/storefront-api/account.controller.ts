import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  addCompanyUserSchema,
  customerAddressInputSchema,
  invoiceListQuerySchema,
  orderListQuerySchema,
  quoteListQuerySchema,
  updateCompanyUserSchema,
  updateCustomerAddressSchema,
  type AddCompanyUserInput,
  type CustomerAddressInput,
  type InvoiceListQuery,
  type OrderListQuery,
  type QuoteListQuery,
  type UpdateCompanyUserInput,
  type UpdateCustomerAddressInput,
} from "@ocean/types";

import { CurrentCustomerSession } from "../../common/auth/current-customer.decorator";
import { Public } from "../../common/auth/public.decorator";
import type { SessionRecord } from "../../common/auth/session.types";
import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { StorefrontGuard } from "../../common/tenant/storefront.guard";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { AccountService } from "./account.service";

// The buyer-facing self-service portal (order history, invoices, quotes, company/team,
// addresses). Every route here requires a signed-in customer: @CurrentCustomerSession() throws
// UnauthenticatedError on its own the moment there's no session (same mechanism customer-auth's
// `me`/`logout` already rely on) — no separate "require login" guard is needed on top of
// StorefrontGuard, which only ever makes the session optional, never absent-but-required.
@Controller("storefront/v1/account")
@Public()
@UseGuards(StorefrontGuard)
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get("profile")
  profile(@CurrentTenant() tenant: TenantContext, @CurrentCustomerSession() session: SessionRecord) {
    return this.account.getProfile(tenant, session.userId);
  }

  @Get("orders")
  async listOrders(
    @CurrentTenant() tenant: TenantContext,
    @CurrentCustomerSession() session: SessionRecord,
    @Query(new ZodValidationPipe(orderListQuerySchema)) query: OrderListQuery,
  ) {
    const membership = await this.account.loadMembership(tenant, session.userId);
    return this.account.listOrders(tenant, session.userId, membership, {
      status: query.status,
      open: query.open,
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  @Get("orders/:id")
  async getOrder(
    @CurrentTenant() tenant: TenantContext,
    @CurrentCustomerSession() session: SessionRecord,
    @Param("id") id: string,
  ) {
    const membership = await this.account.loadMembership(tenant, session.userId);
    return this.account.getOrder(tenant, session.userId, membership, id);
  }

  @Get("quotes")
  async listQuotes(
    @CurrentTenant() tenant: TenantContext,
    @CurrentCustomerSession() session: SessionRecord,
    @Query(new ZodValidationPipe(quoteListQuerySchema)) query: QuoteListQuery,
  ) {
    const membership = await this.account.loadMembership(tenant, session.userId);
    return this.account.listQuotes(tenant, membership, {
      status: query.status,
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  @Get("quotes/:id")
  async getQuote(
    @CurrentTenant() tenant: TenantContext,
    @CurrentCustomerSession() session: SessionRecord,
    @Param("id") id: string,
  ) {
    const membership = await this.account.loadMembership(tenant, session.userId);
    return this.account.getQuote(tenant, membership, id);
  }

  @Get("invoices")
  async listInvoices(
    @CurrentTenant() tenant: TenantContext,
    @CurrentCustomerSession() session: SessionRecord,
    @Query(new ZodValidationPipe(invoiceListQuerySchema)) query: InvoiceListQuery,
  ) {
    const membership = await this.account.loadMembership(tenant, session.userId);
    return this.account.listInvoices(tenant, membership, {
      status: query.status,
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  @Get("invoices/:id")
  async getInvoice(
    @CurrentTenant() tenant: TenantContext,
    @CurrentCustomerSession() session: SessionRecord,
    @Param("id") id: string,
  ) {
    const membership = await this.account.loadMembership(tenant, session.userId);
    return this.account.getInvoice(tenant, membership, id);
  }

  @Get("credit")
  async listCredit(@CurrentTenant() tenant: TenantContext, @CurrentCustomerSession() session: SessionRecord) {
    const membership = await this.account.loadMembership(tenant, session.userId);
    return this.account.listCredit(tenant, membership);
  }

  @Get("company")
  async getCompany(@CurrentTenant() tenant: TenantContext, @CurrentCustomerSession() session: SessionRecord) {
    const membership = await this.account.loadMembership(tenant, session.userId);
    return this.account.getCompany(tenant, membership);
  }

  @Get("team")
  async listTeam(@CurrentTenant() tenant: TenantContext, @CurrentCustomerSession() session: SessionRecord) {
    const membership = await this.account.loadMembership(tenant, session.userId);
    return this.account.listTeam(tenant, membership);
  }

  @Post("team")
  async inviteTeamMember(
    @CurrentTenant() tenant: TenantContext,
    @CurrentCustomerSession() session: SessionRecord,
    @Body(new ZodValidationPipe(addCompanyUserSchema)) body: AddCompanyUserInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    const membership = await this.account.loadMembership(tenant, session.userId);
    return this.account.inviteTeamMember(tenant, membership, body, meta);
  }

  @Patch("team/:id")
  async updateTeamMember(
    @CurrentTenant() tenant: TenantContext,
    @CurrentCustomerSession() session: SessionRecord,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCompanyUserSchema)) body: UpdateCompanyUserInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    const membership = await this.account.loadMembership(tenant, session.userId);
    return this.account.updateTeamMember(tenant, membership, id, body, meta);
  }

  @Delete("team/:id")
  async removeTeamMember(
    @CurrentTenant() tenant: TenantContext,
    @CurrentCustomerSession() session: SessionRecord,
    @Param("id") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    const membership = await this.account.loadMembership(tenant, session.userId);
    await this.account.removeTeamMember(tenant, membership, id, meta);
    return { ok: true };
  }

  @Get("addresses")
  listAddresses(@CurrentTenant() tenant: TenantContext, @CurrentCustomerSession() session: SessionRecord) {
    return this.account.listAddresses(tenant, session.userId);
  }

  @Post("addresses")
  addAddress(
    @CurrentTenant() tenant: TenantContext,
    @CurrentCustomerSession() session: SessionRecord,
    @Body(new ZodValidationPipe(customerAddressInputSchema)) body: CustomerAddressInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.account.addAddress(tenant, session.userId, body, meta);
  }

  @Patch("addresses/:id")
  updateAddress(
    @CurrentTenant() tenant: TenantContext,
    @CurrentCustomerSession() session: SessionRecord,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCustomerAddressSchema)) body: UpdateCustomerAddressInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.account.updateAddress(tenant, session.userId, id, body, meta);
  }

  @Delete("addresses/:id")
  removeAddress(
    @CurrentTenant() tenant: TenantContext,
    @CurrentCustomerSession() session: SessionRecord,
    @Param("id") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.account.removeAddress(tenant, session.userId, id, meta);
  }
}
