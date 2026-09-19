import { Body, Controller, Get, HttpCode, Post, Res } from "@nestjs/common";
import { startImpersonationInputSchema, type StartImpersonationInput } from "@ocean/types";
import type { Response } from "express";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { ImpersonationService } from "./impersonation.service";

@Controller("stores/:storeId/support")
export class SupportController {
  constructor(private readonly impersonation: ImpersonationService) {}

  @Get("impersonations")
  @RequireStore("users.manage")
  list(@CurrentTenant() tenant: TenantContext) {
    return this.impersonation.listForStore(tenant);
  }

  @Post("impersonate")
  @RequireStore("users.manage")
  start(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(startImpersonationInputSchema)) body: StartImpersonationInput,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.impersonation.start(tenant, body, meta, res);
  }

  // No @RequireStore: reachable with whatever session is currently active, which while
  // impersonating is the target's — possibly a much lower-privileged one than users.manage.
  @Post("impersonate/end")
  @HttpCode(204)
  async end(@ReqMeta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    await this.impersonation.end(meta, res);
  }

  @Get("impersonation-status")
  status(@ReqMeta() meta: RequestMeta) {
    return this.impersonation.currentStatus(meta);
  }
}
