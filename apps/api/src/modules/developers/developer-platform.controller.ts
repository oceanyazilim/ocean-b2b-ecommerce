import { Body, Controller, Delete, Get, HttpCode, Param, Post } from "@nestjs/common";
import {
  createApiKeyInputSchema,
  createAppBlockDefinitionInputSchema,
  createDeveloperAppInputSchema,
  createWebhookInputSchema,
  type CreateApiKeyInput,
  type CreateAppBlockDefinitionInput,
  type CreateDeveloperAppInput,
  type CreateWebhookInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { ApiKeysService } from "./api-keys.service";
import { AppBlocksService } from "./app-blocks.service";
import { DeveloperAppsService } from "./developer-apps.service";
import { WebhooksService } from "./webhooks.service";

@Controller("stores/:storeId/developer/apps")
@RequireStore("apps.install")
export class DeveloperAppsController {
  constructor(
    private readonly apps: DeveloperAppsService,
    private readonly blocks: AppBlocksService,
  ) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.apps.list(tenant);
  }

  @Post()
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createDeveloperAppInputSchema)) body: CreateDeveloperAppInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.apps.create(tenant, body, meta);
  }

  @Post(":appId/revoke")
  @HttpCode(204)
  async revoke(
    @CurrentTenant() tenant: TenantContext,
    @Param("appId") appId: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.apps.revoke(tenant, appId, meta);
  }

  @Get(":appId/blocks")
  listBlocks(@CurrentTenant() tenant: TenantContext, @Param("appId") appId: string) {
    return this.blocks.list(tenant, appId);
  }

  @Post(":appId/blocks")
  createBlock(
    @CurrentTenant() tenant: TenantContext,
    @Param("appId") appId: string,
    @Body(new ZodValidationPipe(createAppBlockDefinitionInputSchema)) body: CreateAppBlockDefinitionInput,
  ) {
    return this.blocks.create(tenant, appId, body);
  }
}

@Controller("stores/:storeId/developer/api-keys")
@RequireStore("apps.install")
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.apiKeys.list(tenant);
  }

  @Post()
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createApiKeyInputSchema)) body: CreateApiKeyInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.apiKeys.create(tenant, body, meta);
  }

  @Post(":keyId/revoke")
  @HttpCode(204)
  async revoke(
    @CurrentTenant() tenant: TenantContext,
    @Param("keyId") keyId: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.apiKeys.revoke(tenant, keyId, meta);
  }
}

@Controller("stores/:storeId/developer/webhooks")
@RequireStore("apps.install")
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.webhooks.list(tenant);
  }

  @Post()
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createWebhookInputSchema)) body: CreateWebhookInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.webhooks.create(tenant, body, meta);
  }

  @Delete(":webhookId")
  @HttpCode(204)
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param("webhookId") webhookId: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.webhooks.remove(tenant, webhookId, meta);
  }

  @Get(":webhookId/deliveries")
  listDeliveries(@CurrentTenant() tenant: TenantContext, @Param("webhookId") webhookId: string) {
    return this.webhooks.listDeliveries(tenant, webhookId);
  }
}
