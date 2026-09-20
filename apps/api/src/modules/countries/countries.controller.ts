import { Controller, Get, Param } from "@nestjs/common";

import { CountryProfilesService } from "./countries.service";

// Platform-wide catalog, no tenant scoping needed (same shape as GET /billing/plans and the
// theme catalog): any signed-in user can read it, e.g. to drive a merchant onboarding form or
// an address form.
@Controller("countries")
export class CountriesController {
  constructor(private readonly countries: CountryProfilesService) {}

  @Get()
  list() {
    return this.countries.listActive();
  }

  @Get(":countryCode")
  get(@Param("countryCode") countryCode: string) {
    return this.countries.getByCode(countryCode);
  }
}
