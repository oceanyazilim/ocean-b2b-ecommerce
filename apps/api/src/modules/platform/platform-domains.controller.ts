import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { platformDomainListQuerySchema, type PlatformDomainListQuery } from "@ocean/types";

import { Public } from "../../common/auth/public.decorator";
import { PlatformSessionGuard } from "../../common/auth/platform-session.guard";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { PlatformDomainsService } from "./platform-domains.service";

@Controller("platform/domains")
@Public()
@UseGuards(PlatformSessionGuard)
export class PlatformDomainsController {
  constructor(private readonly domains: PlatformDomainsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(platformDomainListQuerySchema)) query: PlatformDomainListQuery,
  ) {
    return this.domains.list(query);
  }
}
