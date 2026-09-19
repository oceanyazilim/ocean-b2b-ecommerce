import { Module } from "@nestjs/common";

import { EncryptionService } from "../../common/crypto/encryption.service";
import { OrdersModule } from "../orders/orders.module";
import { ProductsModule } from "../catalog/products/products.module";
import { ApiKeyGuard } from "./api-key.guard";
import { ApiKeysService } from "./api-keys.service";
import { AppBlocksService } from "./app-blocks.service";
import { DeveloperAppsController, ApiKeysController, WebhooksController } from "./developer-platform.controller";
import { DeveloperAppsService } from "./developer-apps.service";
import { OAuthController, PublicApiController } from "./public-api.controller";
import { WebhookDispatchService } from "./webhook-dispatch.service";
import { WebhooksService } from "./webhooks.service";

@Module({
  imports: [ProductsModule, OrdersModule],
  controllers: [
    DeveloperAppsController,
    ApiKeysController,
    WebhooksController,
    PublicApiController,
    OAuthController,
  ],
  providers: [
    DeveloperAppsService,
    ApiKeysService,
    WebhooksService,
    WebhookDispatchService,
    AppBlocksService,
    ApiKeyGuard,
    EncryptionService,
  ],
  exports: [DeveloperAppsService],
})
export class DevelopersModule {}
