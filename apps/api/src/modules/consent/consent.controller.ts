import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import {
  trackingScriptInputSchema,
  updateTrackingScriptSchema,
  type TrackingScriptInput,
  type UpdateTrackingScriptInput,
} from "@ocean/types";

import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { ConsentService } from "./consent.service";

// Merchant-facing: manage the store's third-party tracking scripts and review the consent log.
// See ConsentService's module comment for the honest scope of "third-party script controls" here.
@Controller("stores/:storeId/consent")
export class ConsentController {
  constructor(private readonly consent: ConsentService) {}

  @Get("scripts")
  @RequireStore("settings.read")
  listScripts(@CurrentTenant() tenant: TenantContext) {
    return this.consent.listScripts(tenant);
  }

  @Post("scripts")
  @RequireStore("settings.write")
  createScript(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(trackingScriptInputSchema)) body: TrackingScriptInput,
  ) {
    return this.consent.createScript(tenant, body);
  }

  @Patch("scripts/:scriptId")
  @RequireStore("settings.write")
  updateScript(
    @CurrentTenant() tenant: TenantContext,
    @Param("scriptId") id: string,
    @Body(new ZodValidationPipe(updateTrackingScriptSchema)) body: UpdateTrackingScriptInput,
  ) {
    return this.consent.updateScript(tenant, id, body);
  }

  @Delete("scripts/:scriptId")
  @RequireStore("settings.write")
  @HttpCode(204)
  async removeScript(@CurrentTenant() tenant: TenantContext, @Param("scriptId") id: string) {
    await this.consent.removeScript(tenant, id);
  }

  @Get("records")
  @RequireStore("settings.read")
  listRecords(@CurrentTenant() tenant: TenantContext, @Query("limit") limit?: string) {
    // Note: no truthy `parsed &&` short-circuit here — an explicit `limit=0` parses to the
    // falsy-but-valid number 0 and must be respected (zero records), not treated as "no limit
    // given" and fall through to the service's default.
    const parsed = limit === undefined ? undefined : Number.parseInt(limit, 10);
    const validLimit = parsed !== undefined && Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
    return this.consent.listRecords(tenant, validLimit);
  }
}
