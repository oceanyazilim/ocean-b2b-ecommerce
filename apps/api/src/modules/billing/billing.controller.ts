import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import {
  changePlanInputSchema,
  setFeatureFlagInputSchema,
  type ChangePlanInput,
  type SetFeatureFlagInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireOrganization } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { EntitlementsService } from "./entitlements.service";
import { FeatureFlagsService } from "./feature-flags.service";
import { PlansService } from "./plans.service";
import { SubscriptionsService } from "./subscriptions.service";

// The plan catalog needs no tenant — any signed-in user can browse it (pricing page, upgrade
// picker), same as the theme catalog.
@Controller("billing")
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get("plans")
  listCatalog() {
    return this.plans.listCatalog();
  }
}

// Billing is an organization concern, never a store concern (docs/architecture/00-overview.md).
@Controller("organizations/:organizationId/billing")
export class BillingController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly entitlements: EntitlementsService,
    private readonly featureFlags: FeatureFlagsService,
  ) {}

  @Get("subscription")
  @RequireOrganization("organization.billing")
  getSubscription(@CurrentTenant() tenant: TenantContext) {
    return this.subscriptions.getDetail(tenant);
  }

  @Post("subscription")
  @RequireOrganization("organization.billing")
  changePlan(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(changePlanInputSchema)) body: ChangePlanInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.subscriptions.changePlan(tenant, body, meta);
  }

  @Post("subscription/cancel")
  @RequireOrganization("organization.billing")
  cancel(@CurrentTenant() tenant: TenantContext, @ReqMeta() meta: RequestMeta) {
    return this.subscriptions.cancel(tenant, meta);
  }

  @Get("invoices")
  @RequireOrganization("organization.billing")
  listInvoices(@CurrentTenant() tenant: TenantContext) {
    return this.subscriptions.listInvoices(tenant.organizationId);
  }

  @Get("entitlements")
  @RequireOrganization("organization.billing")
  getEntitlements(@CurrentTenant() tenant: TenantContext) {
    return this.entitlements.resolve(tenant.organizationId);
  }

  @Get("feature-flags")
  @RequireOrganization("organization.read")
  listFeatureFlags(@CurrentTenant() tenant: TenantContext) {
    return this.featureFlags.listForOrganization(tenant.organizationId);
  }

  @Patch("feature-flags/:key")
  @RequireOrganization("organization.billing")
  setFeatureFlag(
    @CurrentTenant() tenant: TenantContext,
    @Param("key") key: string,
    @Body(new ZodValidationPipe(setFeatureFlagInputSchema)) body: SetFeatureFlagInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.featureFlags.setForOrganization(tenant, key, body.enabled, meta);
  }
}
