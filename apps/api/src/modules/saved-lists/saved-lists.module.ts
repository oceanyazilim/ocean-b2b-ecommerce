import { Module } from "@nestjs/common";

import { OrdersModule } from "../orders/orders.module";
import { SavedListsController } from "./saved-lists.controller";
import { SavedListsService } from "./saved-lists.service";

@Module({
  imports: [OrdersModule],
  controllers: [SavedListsController],
  providers: [SavedListsService],
  exports: [SavedListsService],
})
export class SavedListsModule {}
