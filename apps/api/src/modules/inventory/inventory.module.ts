import { Module } from "@nestjs/common";

import { InventoryController } from "./inventory.controller";
import { InventoryReservationsService } from "./inventory-reservations.service";
import { InventoryService } from "./inventory.service";
import { LocationsController } from "./locations.controller";
import { LocationsService } from "./locations.service";
import { TransfersController } from "./transfers.controller";
import { TransfersService } from "./transfers.service";

@Module({
  controllers: [LocationsController, InventoryController, TransfersController],
  providers: [LocationsService, InventoryService, TransfersService, InventoryReservationsService],
  exports: [InventoryService, LocationsService, InventoryReservationsService],
})
export class InventoryModule {}
