import { Global, Module } from "@nestjs/common";

import { SessionService } from "../auth/session.service";
import { RateLimitService } from "../rate-limit/rate-limit.service";
import { TenantService } from "./tenant.service";

@Global()
@Module({
  providers: [TenantService, SessionService, RateLimitService],
  exports: [TenantService, SessionService, RateLimitService],
})
export class TenantModule {}
