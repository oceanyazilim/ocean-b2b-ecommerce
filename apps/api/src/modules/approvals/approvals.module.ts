import { Module } from "@nestjs/common";

import { InventoryModule } from "../inventory/inventory.module";
import { ApprovalRulesController, ApprovalsController } from "./approvals.controller";
import { ApprovalsService } from "./approvals.service";

@Module({
  imports: [InventoryModule],
  controllers: [ApprovalRulesController, ApprovalsController],
  providers: [ApprovalsService],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
