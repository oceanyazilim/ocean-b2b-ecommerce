import { Module } from "@nestjs/common";

import { BillingController, PlansController } from "./billing.controller";
import { EntitlementsService } from "./entitlements.service";
import { FeatureFlagsService } from "./feature-flags.service";
import { PlansService } from "./plans.service";
import { SubscriptionsService } from "./subscriptions.service";

@Module({
  controllers: [PlansController, BillingController],
  providers: [PlansService, SubscriptionsService, EntitlementsService, FeatureFlagsService],
  exports: [EntitlementsService, SubscriptionsService],
})
export class BillingModule {}
