import { Body, Controller, Get, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { consentDecisionSchema, type ConsentDecisionInput } from "@ocean/types";
import type { Request, Response } from "express";

import { Public } from "../../common/auth/public.decorator";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { StorefrontGuard } from "../../common/tenant/storefront.guard";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { ConsentService } from "../consent/consent.service";

function consentCookieName(storeId: string): string {
  return `ocean_consent_${storeId}`;
}

// Public, storefront-facing consent banner endpoints. Same "plain (non-sensitive) id cookie"
// pattern as StorefrontCartController's cart cookie — the visitor id only points at this
// browser's ConsentRecord history, it authenticates nothing.
@Controller("storefront/v1/consent")
@Public()
@UseGuards(StorefrontGuard)
export class StorefrontConsentController {
  constructor(private readonly consent: ConsentService) {}

  private visitorId(req: Request, tenant: TenantContext): string | null {
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    return cookies[consentCookieName(tenant.storeId as string)] ?? null;
  }

  @Get("rules")
  getRules(
    @CurrentTenant() tenant: TenantContext,
    @Req() req: Request,
    @Query("countryCode") countryCode: string | undefined,
  ) {
    return this.consent.getConsentRules(tenant, countryCode, this.visitorId(req, tenant));
  }

  @Post()
  async record(
    @CurrentTenant() tenant: TenantContext,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(consentDecisionSchema)) body: ConsentDecisionInput,
  ) {
    const existing = this.visitorId(req, tenant);
    const visitorId = existing ?? randomUUID();
    const customerId = tenant.actor.type === "customer" ? tenant.actor.id : null;
    const uaHeader = req.headers["user-agent"];
    const userAgent = Array.isArray(uaHeader) ? (uaHeader[0] ?? null) : (uaHeader ?? null);
    const created = await this.consent.recordConsent(tenant, visitorId, body, customerId, userAgent);
    res.cookie(consentCookieName(tenant.storeId as string), visitorId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 365 * 24 * 60 * 60 * 1000,
    });
    return created;
  }
}
