-- CreateEnum
CREATE TYPE "CartStatus" AS ENUM ('active', 'completed', 'abandoned');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending_approval', 'confirmed', 'processing', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'authorized', 'paid', 'partially_paid', 'partially_refunded', 'refunded', 'voided');

-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('unfulfilled', 'partially_fulfilled', 'fulfilled');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('storefront', 'draft_order', 'admin', 'api');

-- CreateEnum
CREATE TYPE "PriceSourceKind" AS ENUM ('contract', 'price_list', 'volume', 'base', 'custom');

-- CreateEnum
CREATE TYPE "DraftOrderStatus" AS ENUM ('open', 'completed', 'cancelled');

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "draft_sequence" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN     "order_sequence" INTEGER NOT NULL DEFAULT 1000;

-- CreateTable
CREATE TABLE "carts" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "status" "CartStatus" NOT NULL DEFAULT 'active',
    "customer_id" UUID,
    "company_id" UUID,
    "company_location_id" UUID,
    "email" TEXT,
    "currency" CHAR(3) NOT NULL,
    "po_number" TEXT,
    "note" TEXT,
    "shipping_address" JSONB,
    "billing_address" JSONB,
    "completed_order_id" UUID,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "properties" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'confirmed',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "fulfillment_status" "FulfillmentStatus" NOT NULL DEFAULT 'unfulfilled',
    "source" "OrderSource" NOT NULL,
    "customer_id" UUID,
    "company_id" UUID,
    "company_location_id" UUID,
    "email" TEXT,
    "currency" CHAR(3) NOT NULL,
    "po_number" TEXT,
    "note" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "item_count" INTEGER NOT NULL,
    "subtotal" BIGINT NOT NULL,
    "discount_total" BIGINT NOT NULL DEFAULT 0,
    "shipping_total" BIGINT NOT NULL DEFAULT 0,
    "tax_total" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL,
    "shipping_address" JSONB,
    "billing_address" JSONB,
    "cart_id" UUID,
    "draft_order_id" UUID,
    "placed_by_id" UUID,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "closed_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "variant_id" UUID,
    "product_id" UUID,
    "title" TEXT NOT NULL,
    "variant_title" TEXT NOT NULL,
    "sku" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit_price" BIGINT NOT NULL,
    "compare_at_price" BIGINT,
    "price_source" "PriceSourceKind" NOT NULL,
    "discount" BIGINT NOT NULL DEFAULT 0,
    "tax" BIGINT NOT NULL DEFAULT 0,
    "line_total" BIGINT NOT NULL,
    "requires_shipping" BOOLEAN NOT NULL DEFAULT true,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "fulfilled_quantity" INTEGER NOT NULL DEFAULT 0,
    "refunded_quantity" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item_reservations" (
    "id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "released_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_item_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_events" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "actor_type" "ActorType" NOT NULL,
    "actor_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_orders" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" "DraftOrderStatus" NOT NULL DEFAULT 'open',
    "customer_id" UUID,
    "company_id" UUID,
    "company_location_id" UUID,
    "email" TEXT,
    "currency" CHAR(3) NOT NULL,
    "po_number" TEXT,
    "note" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "shipping_address" JSONB,
    "billing_address" JSONB,
    "subtotal" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL DEFAULT 0,
    "completed_order_id" UUID,
    "created_by_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "draft_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_order_items" (
    "id" UUID NOT NULL,
    "draft_order_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" BIGINT NOT NULL,
    "price_source" "PriceSourceKind" NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "draft_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "carts_store_id_status_updated_at_idx" ON "carts"("store_id", "status", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "carts_store_id_customer_id_idx" ON "carts"("store_id", "customer_id");

-- CreateIndex
CREATE INDEX "carts_store_id_company_id_idx" ON "carts"("store_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "cart_items_cart_id_variant_id_key" ON "cart_items"("cart_id", "variant_id");

-- CreateIndex
CREATE INDEX "orders_store_id_created_at_idx" ON "orders"("store_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "orders_store_id_status_created_at_idx" ON "orders"("store_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "orders_store_id_payment_status_idx" ON "orders"("store_id", "payment_status");

-- CreateIndex
CREATE INDEX "orders_store_id_fulfillment_status_idx" ON "orders"("store_id", "fulfillment_status");

-- CreateIndex
CREATE INDEX "orders_store_id_customer_id_idx" ON "orders"("store_id", "customer_id");

-- CreateIndex
CREATE INDEX "orders_store_id_company_id_idx" ON "orders"("store_id", "company_id");

-- CreateIndex
CREATE INDEX "orders_store_id_email_idx" ON "orders"("store_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "orders_store_id_number_key" ON "orders"("store_id", "number");

-- CreateIndex
CREATE INDEX "order_items_order_id_position_idx" ON "order_items"("order_id", "position");

-- CreateIndex
CREATE INDEX "order_items_store_id_variant_id_idx" ON "order_items"("store_id", "variant_id");

-- CreateIndex
CREATE INDEX "order_item_reservations_order_item_id_idx" ON "order_item_reservations"("order_item_id");

-- CreateIndex
CREATE INDEX "order_item_reservations_store_id_inventory_item_id_location_idx" ON "order_item_reservations"("store_id", "inventory_item_id", "location_id");

-- CreateIndex
CREATE INDEX "order_events_order_id_created_at_idx" ON "order_events"("order_id", "created_at");

-- CreateIndex
CREATE INDEX "draft_orders_store_id_status_updated_at_idx" ON "draft_orders"("store_id", "status", "updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "draft_orders_store_id_number_key" ON "draft_orders"("store_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "draft_order_items_draft_order_id_variant_id_key" ON "draft_order_items"("draft_order_id", "variant_id");

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_store_id_scope_key_key" ON "idempotency_keys"("store_id", "scope", "key");

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_company_location_id_fkey" FOREIGN KEY ("company_location_id") REFERENCES "company_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_company_location_id_fkey" FOREIGN KEY ("company_location_id") REFERENCES "company_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_placed_by_id_fkey" FOREIGN KEY ("placed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_reservations" ADD CONSTRAINT "order_item_reservations_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_reservations" ADD CONSTRAINT "order_item_reservations_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_reservations" ADD CONSTRAINT "order_item_reservations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_orders" ADD CONSTRAINT "draft_orders_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_orders" ADD CONSTRAINT "draft_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_orders" ADD CONSTRAINT "draft_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_orders" ADD CONSTRAINT "draft_orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_orders" ADD CONSTRAINT "draft_orders_company_location_id_fkey" FOREIGN KEY ("company_location_id") REFERENCES "company_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_orders" ADD CONSTRAINT "draft_orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_order_items" ADD CONSTRAINT "draft_order_items_draft_order_id_fkey" FOREIGN KEY ("draft_order_id") REFERENCES "draft_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_order_items" ADD CONSTRAINT "draft_order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantities" CHECK ("quantity" > 0 AND "fulfilled_quantity" >= 0 AND "refunded_quantity" >= 0 AND "fulfilled_quantity" <= "quantity" AND "refunded_quantity" <= "quantity");
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_money_nonnegative" CHECK ("unit_price" >= 0 AND "discount" >= 0 AND "tax" >= 0 AND "line_total" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_money_nonnegative" CHECK ("subtotal" >= 0 AND "discount_total" >= 0 AND "shipping_total" >= 0 AND "tax_total" >= 0 AND "total" >= 0);
ALTER TABLE "order_item_reservations" ADD CONSTRAINT "order_item_reservations_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "draft_order_items" ADD CONSTRAINT "draft_order_items_positive" CHECK ("quantity" > 0 AND "unit_price" >= 0);
