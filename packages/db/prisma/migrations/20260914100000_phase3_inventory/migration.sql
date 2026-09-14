-- CreateEnum
CREATE TYPE "InventoryTrackingType" AS ENUM ('variant', 'sku', 'upc');

-- CreateEnum
CREATE TYPE "InventoryMovementReason" AS ENUM ('adjustment', 'transfer', 'return', 'damage', 'count');

-- CreateEnum
CREATE TYPE "InventoryMovementSource" AS ENUM ('manual', 'system', 'import');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'warehouse',
    "address" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "product_variant_id" UUID,
    "sku" TEXT,
    "upc" TEXT,
    "tracking_type" "InventoryTrackingType" NOT NULL,
    "on_hand" INTEGER NOT NULL DEFAULT 0,
    "committed" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "damaged" INTEGER NOT NULL DEFAULT 0,
    "last_moved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_levels" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "damaged" INTEGER NOT NULL DEFAULT 0,
    "last_moved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inventory_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "from_location_id" UUID,
    "to_location_id" UUID,
    "quantity" INTEGER NOT NULL,
    "reason" "InventoryMovementReason" NOT NULL,
    "reference" TEXT,
    "source" "InventoryMovementSource" NOT NULL DEFAULT 'manual',
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_requests" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "from_location_id" UUID NOT NULL,
    "to_location_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'pending',
    "requested_by_id" UUID NOT NULL,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "transfer_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "locations_store_id_is_active_is_default_idx" ON "locations"("store_id", "is_active", "is_default");

-- CreateIndex
CREATE UNIQUE INDEX "locations_store_id_name_key" ON "locations"("store_id", "name");

-- CreateIndex
CREATE INDEX "inventory_items_store_id_product_variant_id_idx" ON "inventory_items"("store_id", "product_variant_id");

-- CreateIndex
CREATE INDEX "inventory_items_store_id_sku_idx" ON "inventory_items"("store_id", "sku");

-- CreateIndex
CREATE INDEX "inventory_items_store_id_upc_idx" ON "inventory_items"("store_id", "upc");

-- CreateIndex
CREATE INDEX "inventory_levels_store_id_location_id_idx" ON "inventory_levels"("store_id", "location_id");

-- CreateIndex
CREATE INDEX "inventory_levels_item_id_idx" ON "inventory_levels"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_levels_item_id_location_id_key" ON "inventory_levels"("item_id", "location_id");

-- CreateIndex
CREATE INDEX "inventory_movements_store_id_created_at_idx" ON "inventory_movements"("store_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "inventory_movements_store_id_item_id_idx" ON "inventory_movements"("store_id", "item_id");

-- CreateIndex
CREATE INDEX "inventory_movements_store_id_reason_idx" ON "inventory_movements"("store_id", "reason");

-- CreateIndex
CREATE INDEX "inventory_movements_store_id_from_location_id_idx" ON "inventory_movements"("store_id", "from_location_id");

-- CreateIndex
CREATE INDEX "inventory_movements_store_id_to_location_id_idx" ON "inventory_movements"("store_id", "to_location_id");

-- CreateIndex
CREATE INDEX "transfer_requests_store_id_status_idx" ON "transfer_requests"("store_id", "status");

-- CreateIndex
CREATE INDEX "transfer_requests_store_id_created_at_idx" ON "transfer_requests"("store_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Partial unique indexes: one inventory item per variant / sku / upc within a store.
CREATE UNIQUE INDEX "inventory_items_store_id_product_variant_id_key" ON "inventory_items"("store_id", "product_variant_id") WHERE "product_variant_id" IS NOT NULL;
CREATE UNIQUE INDEX "inventory_items_store_id_sku_key" ON "inventory_items"("store_id", "sku") WHERE "sku" IS NOT NULL;
CREATE UNIQUE INDEX "inventory_items_store_id_upc_key" ON "inventory_items"("store_id", "upc") WHERE "upc" IS NOT NULL;

-- Only one default location per store.
CREATE UNIQUE INDEX "locations_store_id_default_key" ON "locations"("store_id") WHERE "is_default" = true;

-- Stock can never go negative; the ledger enforces it at the database boundary too.
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_quantity_nonnegative" CHECK ("quantity" >= 0 AND "reserved" >= 0 AND "damaged" >= 0 AND "reserved" + "damaged" <= "quantity");
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_distinct_locations" CHECK ("from_location_id" <> "to_location_id");
