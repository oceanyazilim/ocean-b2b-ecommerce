import { Module } from "@nestjs/common";

import { ArticlesController } from "./articles.controller";
import { BlogsController } from "./blogs.controller";
import { ContentService } from "./content.service";
import { MenusController } from "./menus.controller";
import { PagesController } from "./pages.controller";

@Module({
  controllers: [PagesController, BlogsController, ArticlesController, MenusController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}
