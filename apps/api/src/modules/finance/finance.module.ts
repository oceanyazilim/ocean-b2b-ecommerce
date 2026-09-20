import { Module } from "@nestjs/common";
import { EInvoiceConnectionsController } from "./einvoice-connections.controller";
import { EInvoiceConnectionsService } from "./einvoice-connections.service";
import { FinanceService } from "./finance.service";
import { FinanceController } from "./finance.controller";
import { InvoicingSettingsController } from "./invoicing-settings.controller";
import { InvoicingSettingsService } from "./invoicing-settings.service";

@Module({
  controllers: [FinanceController, InvoicingSettingsController, EInvoiceConnectionsController],
  providers: [FinanceService, InvoicingSettingsService, EInvoiceConnectionsService],
  exports: [FinanceService, InvoicingSettingsService, EInvoiceConnectionsService],
})
export class FinanceModule {}
