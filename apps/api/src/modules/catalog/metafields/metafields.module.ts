import { Module } from "@nestjs/common";

import { MetafieldDefinitionsController } from "./metafields.controller";
import { MetafieldsService } from "./metafields.service";

@Module({
  controllers: [MetafieldDefinitionsController],
  providers: [MetafieldsService],
  exports: [MetafieldsService],
})
export class MetafieldsModule {}
