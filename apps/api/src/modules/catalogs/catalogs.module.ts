import { Module } from "@nestjs/common";

import { AssignmentTargetsService } from "./assignment-targets.service";
import { CatalogAccessService } from "./catalog-access.service";
import { CatalogsController } from "./catalogs.controller";
import { CatalogsService } from "./catalogs.service";

@Module({
  controllers: [CatalogsController],
  providers: [CatalogsService, CatalogAccessService, AssignmentTargetsService],
  exports: [CatalogsService, CatalogAccessService, AssignmentTargetsService],
})
export class CatalogsModule {}
