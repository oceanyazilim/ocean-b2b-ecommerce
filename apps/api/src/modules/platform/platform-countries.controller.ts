import { Controller, Get, UseGuards } from "@nestjs/common";

import { Public } from "../../common/auth/public.decorator";
import { PlatformRoleGuard } from "../../common/auth/platform-role.guard";
import { PlatformSessionGuard } from "../../common/auth/platform-session.guard";
import { PlatformCountriesService } from "./platform-countries.service";

// Read-only, like PlatformFeatureFlagsController's list/read: open to any active operator
// (viewer and up) — there is no mutation here, country data itself is still only ever written by
// CountryProfilesService's seed (see apps/api/src/modules/countries).
@Controller("platform/countries")
@Public()
@UseGuards(PlatformSessionGuard, PlatformRoleGuard)
export class PlatformCountriesController {
  constructor(private readonly countries: PlatformCountriesService) {}

  @Get()
  list() {
    return this.countries.list();
  }
}
