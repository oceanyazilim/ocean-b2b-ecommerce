import { Global, Module } from "@nestjs/common";

import { SearchService } from "./search.service";

// Global, like RedisModule/PrismaModule — every domain module that writes a product (today:
// ProductsService) or reads storefront search (StorefrontSearchService) injects SearchService
// directly rather than importing this module everywhere.
@Global()
@Module({
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
