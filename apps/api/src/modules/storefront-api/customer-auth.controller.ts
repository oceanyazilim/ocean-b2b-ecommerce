import { Body, Controller, Get, HttpCode, Post, Res, UseGuards } from "@nestjs/common";
import {
  customerLoginSchema,
  customerSignupSchema,
  type CustomerLoginInput,
  type CustomerSignupInput,
} from "@ocean/types";
import type { Response } from "express";

import { Public } from "../../common/auth/public.decorator";
import { CurrentCustomerSession } from "../../common/auth/current-customer.decorator";
import { SessionService } from "../../common/auth/session.service";
import type { SessionRecord } from "../../common/auth/session.types";
import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { RateLimit } from "../../common/rate-limit/rate-limit.decorator";
import { RateLimitGuard } from "../../common/rate-limit/rate-limit.guard";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { StorefrontGuard } from "../../common/tenant/storefront.guard";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { CustomerAuthService } from "./customer-auth.service";

@Controller("storefront/v1/auth")
@Public()
@UseGuards(StorefrontGuard, RateLimitGuard)
export class CustomerAuthController {
  constructor(
    private readonly customerAuth: CustomerAuthService,
    private readonly sessions: SessionService,
  ) {}

  @Post("signup")
  @RateLimit({ bucket: "customer-signup", limit: 5, windowSeconds: 3600 })
  async signup(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(customerSignupSchema)) body: CustomerSignupInput,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { customer, session } = await this.customerAuth.signup(
      tenant.storeId as string,
      tenant.organizationId,
      body,
      meta,
    );
    this.sessions.attachCustomerCookie(res, tenant.storeId as string, session);
    return customer;
  }

  @Post("login")
  @HttpCode(200)
  @RateLimit({ bucket: "customer-login", limit: 10, windowSeconds: 60 })
  async login(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(customerLoginSchema)) body: CustomerLoginInput,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { customer, session } = await this.customerAuth.login(tenant.storeId as string, body, meta);
    this.sessions.attachCustomerCookie(res, tenant.storeId as string, session);
    return customer;
  }

  @Post("logout")
  @HttpCode(200)
  async logout(
    @CurrentTenant() tenant: TenantContext,
    @CurrentCustomerSession() session: SessionRecord,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.customerAuth.logout(session, meta);
    this.sessions.clearCustomerCookie(res, tenant.storeId as string);
    return { ok: true };
  }

  @Get("me")
  me(@CurrentCustomerSession() session: SessionRecord) {
    return this.customerAuth.me(session.userId);
  }
}
