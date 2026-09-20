import { Module } from "@nestjs/common";

import { GlossaryController } from "./glossary.controller";
import { GlossaryService } from "./glossary.service";
import { StoreLanguagesController } from "./store-languages.controller";
import { StoreLanguagesService } from "./store-languages.service";
import { TranslationMemoryService } from "./translation-memory.service";
import { TranslationsController } from "./translations.controller";
import { TranslationsService } from "./translations.service";

@Module({
  controllers: [StoreLanguagesController, TranslationsController, GlossaryController],
  providers: [StoreLanguagesService, TranslationsService, TranslationMemoryService, GlossaryService],
  exports: [StoreLanguagesService, TranslationsService, TranslationMemoryService, GlossaryService],
})
export class LocalizationModule {}
