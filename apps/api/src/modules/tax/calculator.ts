import { Inject, Injectable } from "@nestjs/common";

import type { CalculatorContext, TaxCalculator } from "../orders/calculators";
import { TAX_PROVIDER, type TaxProvider } from "./tax-provider";

// Thin adapter between the orders/checkout domain's TaxCalculator interface (TAX_CALCULATOR DI
// token, see orders.module.ts) and the TaxProvider abstraction (spec section 50). All the real
// rate-lookup logic now lives in ManualTaxProvider — this class exists only so orders.module.ts's
// existing wiring (`{ provide: TAX_CALCULATOR, useExisting: TaxCalculatorService }`) keeps
// working unchanged, and so a future second TaxProvider can be selected here (e.g. per store)
// without touching the orders module at all.
@Injectable()
export class TaxCalculatorService implements TaxCalculator {
  constructor(@Inject(TAX_PROVIDER) private readonly provider: TaxProvider) {}

  async taxes(input: CalculatorContext): Promise<{ perLine: number[]; total: number }> {
    return this.provider.calculateTax(input);
  }
}
