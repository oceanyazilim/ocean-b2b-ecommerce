import { Module } from "@nestjs/common";

import { TaxCalculatorService } from "./calculator";
import { TaxController } from "./tax.controller";
import { TaxService } from "./tax.service";

@Module({
  controllers: [TaxController],
  providers: [TaxService, TaxCalculatorService],
  exports: [TaxCalculatorService],
})
export class TaxModule {}
