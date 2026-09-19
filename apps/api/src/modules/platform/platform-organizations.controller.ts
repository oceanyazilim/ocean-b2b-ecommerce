import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import {
  platformOrganizationListQuerySchema,
  platformStoreListQuerySchema,
  type PlatformOrganizationListQuery,
  type PlatformStoreListQuery,
} from "@ocean/types";

import { Public } from "../../common/auth/public.decorator";
import { PlatformSessionGuard } from "../../common/auth/platform-session.guard";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { PlatformOrganizationsService } from "./platform-organizations.service";

@Controller("platform/organizations")
@Public()
@UseGuards(PlatformSessionGuard)
export class PlatformOrganizationsController {
  constructor(private readonly organizations: PlatformOrganizationsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(platformOrganizationListQuerySchema))
    query: PlatformOrganizationListQuery,
  ) {
    return this.organizations.list(query);
  }

  @Get(":organizationId")
  detail(@Param("organizationId") organizationId: string) {
    return this.organizations.detail(organizationId);
  }
}

@Controller("platform/stores")
@Public()
@UseGuards(PlatformSessionGuard)
export class PlatformStoresController {
  constructor(private readonly organizations: PlatformOrganizationsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(platformStoreListQuerySchema)) query: PlatformStoreListQuery,
  ) {
    return this.organizations.listStores(query);
  }
}
