import { Module } from "@nestjs/common";

import { CountriesModule } from "../countries/countries.module";
import { StoresModule } from "../stores/stores.module";
import { UsersModule } from "../users/users.module";
import { OrganizationsController } from "./organizations.controller";
import { OrganizationsRepository } from "./organizations.repository";
import { OrganizationsService } from "./organizations.service";

@Module({
  imports: [UsersModule, StoresModule, CountriesModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrganizationsRepository],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
