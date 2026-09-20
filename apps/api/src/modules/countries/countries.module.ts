import { Module } from "@nestjs/common";

import { CountriesController } from "./countries.controller";
import { CountryProfilesService } from "./countries.service";

@Module({
  controllers: [CountriesController],
  providers: [CountryProfilesService],
  exports: [CountryProfilesService],
})
export class CountriesModule {}
