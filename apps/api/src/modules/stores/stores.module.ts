import { Module } from "@nestjs/common";

import { StoresController } from "./stores.controller";
import { StoresRepository } from "./stores.repository";
import { StoresService } from "./stores.service";

@Module({
  controllers: [StoresController],
  providers: [StoresService, StoresRepository],
  exports: [StoresService],
})
export class StoresModule {}
