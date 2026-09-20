import { Module } from "@nestjs/common";

import { MetafieldsModule } from "../catalog/metafields/metafields.module";
import { CountriesModule } from "../countries/countries.module";
import { CustomersModule } from "../customers/customers.module";
import { CompaniesController } from "./companies.controller";
import { CompaniesService } from "./companies.service";
import { CompanyApplicationsController } from "./company-applications.controller";
import { CompanyApplicationsService } from "./company-applications.service";
import { CompanyLocationsController } from "./company-locations.controller";
import { CompanyLocationsService } from "./company-locations.service";
import { CompanyUsersController } from "./company-users.controller";
import { CompanyUsersService } from "./company-users.service";

@Module({
  imports: [MetafieldsModule, CustomersModule, CountriesModule],
  controllers: [
    CompaniesController,
    CompanyLocationsController,
    CompanyUsersController,
    CompanyApplicationsController,
  ],
  providers: [
    CompaniesService,
    CompanyLocationsService,
    CompanyUsersService,
    CompanyApplicationsService,
  ],
  exports: [CompaniesService, CompanyLocationsService, CompanyUsersService],
})
export class CompaniesModule {}
