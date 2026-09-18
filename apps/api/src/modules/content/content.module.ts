import { Module } from "@nestjs/common";

import { ContentService } from "./content.service";
import { MenusController } from "./menus.controller";
import { PagesController } from "./pages.controller";

@Module({
  controllers: [PagesController, MenusController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}
