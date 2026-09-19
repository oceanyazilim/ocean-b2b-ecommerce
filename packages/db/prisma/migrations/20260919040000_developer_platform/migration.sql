-- AlterTable
ALTER TABLE "domain_events" ADD COLUMN "webhook_relayed_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "domain_events_webhook_relayed_at_occurred_at_idx" ON "domain_events"("webhook_relayed_at", "occurred_at");

-- CreateEnum
CREATE TYPE "DeveloperAppStatus" AS ENUM ('active', 'revoked');

-- CreateEnum
CREATE TYPE "ApiKeyKind" AS ENUM ('static', 'oauth_token');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('pending', 'delivered', 'failed');

-- CreateTable
CREATE TABLE "developer_apps" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "client_secret_hash" TEXT NOT NULL,
    "scopes" TEXT[],
    "status" "DeveloperAppStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "developer_apps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "app_id" UUID,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "scopes" TEXT[],
    "kind" "ApiKeyKind" NOT NULL DEFAULT 'static',
    "expires_at" TIMESTAMPTZ(6),
    "last_used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "app_id" UUID,
    "topic" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret_enc" TEXT NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL,
    "webhook_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'pending',
    "response_code" INTEGER,
    "next_retry_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_block_definitions" (
    "id" UUID NOT NULL,
    "app_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "settings_schema" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_block_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "developer_apps_client_id_key" ON "developer_apps"("client_id");

-- CreateIndex
CREATE INDEX "developer_apps_store_id_idx" ON "developer_apps"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_store_id_idx" ON "api_keys"("store_id");

-- CreateIndex
CREATE INDEX "webhooks_store_id_topic_idx" ON "webhooks"("store_id", "topic");

-- CreateIndex
CREATE INDEX "webhook_deliveries_webhook_id_created_at_idx" ON "webhook_deliveries"("webhook_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "app_block_definitions_app_id_type_key" ON "app_block_definitions"("app_id", "type");

-- AddForeignKey
ALTER TABLE "developer_apps" ADD CONSTRAINT "developer_apps_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "developer_apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "developer_apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_block_definitions" ADD CONSTRAINT "app_block_definitions_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "developer_apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
