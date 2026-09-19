import { Controller, Get, Param, UseGuards } from "@nestjs/common";

import { Public } from "../../common/auth/public.decorator";
import { PlatformSessionGuard } from "../../common/auth/platform-session.guard";
import { PlansService } from "../billing/plans.service";
import { SubscriptionsService } from "../billing/subscriptions.service";

// Read-only by design (see the task brief: billing inspection, not billing management — plan
// changes stay a merchant/organization-owner action in apps/admin).
@Controller("platform/organizations/:organizationId/billing")
@Public()
@UseGuards(PlatformSessionGuard)
export class PlatformBillingController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get("invoices")
  listInvoices(@Param("organizationId") organizationId: string) {
    return this.subscriptions.listInvoices(organizationId);
  }
}

@Controller("platform/plans")
@Public()
@UseGuards(PlatformSessionGuard)
export class PlatformPlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  list() {
    return this.plans.listCatalog();
  }
}
