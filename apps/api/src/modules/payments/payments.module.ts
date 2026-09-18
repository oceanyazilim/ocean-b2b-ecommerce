import { Module } from "@nestjs/common";

import { InventoryModule } from "../inventory/inventory.module";
import { ManualPaymentAdapter } from "./adapters/manual.adapter";
import { TestPaymentAdapter } from "./adapters/test.adapter";
import { PaymentMethodsController } from "./payment-methods.controller";
import { PaymentMethodsService } from "./payment-methods.service";
import { PaymentsController, RefundsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";

@Module({
  imports: [InventoryModule],
  controllers: [PaymentMethodsController, PaymentsController, RefundsController],
  providers: [ManualPaymentAdapter, TestPaymentAdapter, PaymentMethodsService, PaymentsService],
  exports: [PaymentsService, PaymentMethodsService],
})
export class PaymentsModule {}
