import { Module } from "@nestjs/common";

import { MetafieldsModule } from "../catalog/metafields/metafields.module";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";

@Module({
  imports: [MetafieldsModule],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
