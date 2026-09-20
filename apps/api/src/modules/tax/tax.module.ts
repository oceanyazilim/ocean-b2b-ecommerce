import { Module } from "@nestjs/common";

import { CountriesModule } from "../countries/countries.module";
import { TaxCalculatorService } from "./calculator";
import { TaxController } from "./tax.controller";
import { TaxService } from "./tax.service";

@Module({
  imports: [CountriesModule],
  controllers: [TaxController],
  providers: [TaxService, TaxCalculatorService],
  exports: [TaxCalculatorService],
})
export class TaxModule {}
