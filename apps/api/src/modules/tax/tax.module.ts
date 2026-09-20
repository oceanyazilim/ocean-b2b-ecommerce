import { Module } from "@nestjs/common";

import { CountriesModule } from "../countries/countries.module";
import { TaxCalculatorService } from "./calculator";
import { ManualTaxProvider } from "./manual-tax-provider";
import { TAX_PROVIDER } from "./tax-provider";
import { TaxController } from "./tax.controller";
import { TaxService } from "./tax.service";

@Module({
  imports: [CountriesModule],
  controllers: [TaxController],
  providers: [
    TaxService,
    TaxCalculatorService,
    ManualTaxProvider,
    // Spec section 50: the one binding a future second TaxProvider would need to change (or make
    // conditional per store) — every caller depends on the TAX_PROVIDER token, never on
    // ManualTaxProvider directly.
    { provide: TAX_PROVIDER, useExisting: ManualTaxProvider },
  ],
  exports: [TaxCalculatorService, TAX_PROVIDER],
})
export class TaxModule {}
