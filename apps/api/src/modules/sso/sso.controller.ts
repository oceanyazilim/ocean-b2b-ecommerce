import { Body, Controller, Delete, Get, Param, Put, Query, Res } from "@nestjs/common";
import { upsertSsoConnectionInputSchema, type UpsertSsoConnectionInput } from "@ocean/types";
import type { Response } from "express";

import { Public } from "../../common/auth/public.decorator";
import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireOrganization } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { SsoService } from "./sso.service";

@Controller("organizations/:organizationId/sso")
export class SsoConnectionController {
  constructor(private readonly sso: SsoService) {}

  @Get()
  @RequireOrganization("organization.write")
  get(@CurrentTenant() tenant: TenantContext) {
    return this.sso.getConnection(tenant);
  }

  @Put()
  @RequireOrganization("organization.write")
  upsert(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(upsertSsoConnectionInputSchema)) body: UpsertSsoConnectionInput,
  ) {
    return this.sso.upsert(tenant, body);
  }

  @Delete()
  @RequireOrganization("organization.write")
  async remove(@CurrentTenant() tenant: TenantContext) {
    await this.sso.remove(tenant);
    return { ok: true };
  }
}

// Unauthenticated by nature — this IS the login flow, an alternative to /auth/login.
@Controller("auth/sso")
@Public()
export class SsoLoginController {
  constructor(private readonly sso: SsoService) {}

  @Get(":domain/start")
  async start(@Param("domain") domain: string, @Res() res: Response) {
    const url = await this.sso.buildAuthorizeUrl(domain);
    res.redirect(url);
  }

  @Get("callback")
  async callback(
    @Query("code") code: string,
    @Query("state") state: string,
    @ReqMeta() meta: RequestMeta,
    @Res() res: Response,
  ) {
    const { redirectTo } = await this.sso.handleCallback(code, state, meta, res);
    res.redirect(redirectTo);
  }
}
