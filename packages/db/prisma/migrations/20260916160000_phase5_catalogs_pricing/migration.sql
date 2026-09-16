-- CreateEnum
CREATE TYPE "CatalogStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "PriceListStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "PricingScope" AS ENUM ('variant', 'product', 'collection', 'store');

-- CreateEnum
CREATE TYPE "VolumeTierType" AS ENUM ('fixed_price', 'percent_off');

-- CreateTable
CREATE TABLE "catalogs" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "CatalogStatus" NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "catalogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_products" (
    "catalog_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_products_pkey" PRIMARY KEY ("catalog_id","product_id")
);

-- CreateTable
CREATE TABLE "catalog_assignments" (
    "id" UUID NOT NULL,
    "catalog_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "company_id" UUID,
    "company_location_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_lists" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "currency" CHAR(3) NOT NULL,
    "status" "PriceListStatus" NOT NULL DEFAULT 'draft',
    "adjustment_bps" INTEGER NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "price_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_list_prices" (
    "id" UUID NOT NULL,
    "price_list_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "price" BIGINT NOT NULL,
    "compare_at_price" BIGINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "price_list_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_list_assignments" (
    "id" UUID NOT NULL,
    "price_list_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "company_id" UUID,
    "company_location_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_list_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volume_pricing_rules" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "PricingScope" NOT NULL,
    "scope_id" UUID,
    "price_list_id" UUID,
    "tier_type" "VolumeTierType" NOT NULL,
    "tiers" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "volume_pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quantity_rules" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "scope" "PricingScope" NOT NULL,
    "scope_id" UUID NOT NULL,
    "min_quantity" INTEGER,
    "max_quantity" INTEGER,
    "increment" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "quantity_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_prices" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "company_location_id" UUID,
    "variant_id" UUID NOT NULL,
    "price" BIGINT NOT NULL,
    "valid_from" TIMESTAMPTZ(6),
    "valid_to" TIMESTAMPTZ(6),
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "contract_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "catalogs_store_id_status_idx" ON "catalogs"("store_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "catalogs_store_id_name_key" ON "catalogs"("store_id", "name");

-- CreateIndex
CREATE INDEX "catalog_products_product_id_idx" ON "catalog_products"("product_id");

-- CreateIndex
CREATE INDEX "catalog_assignments_catalog_id_idx" ON "catalog_assignments"("catalog_id");

-- CreateIndex
CREATE INDEX "catalog_assignments_store_id_company_id_idx" ON "catalog_assignments"("store_id", "company_id");

-- CreateIndex
CREATE INDEX "catalog_assignments_store_id_company_location_id_idx" ON "catalog_assignments"("store_id", "company_location_id");

-- CreateIndex
CREATE INDEX "price_lists_store_id_status_priority_idx" ON "price_lists"("store_id", "status", "priority" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "price_lists_store_id_name_key" ON "price_lists"("store_id", "name");

-- CreateIndex
CREATE INDEX "price_list_prices_store_id_variant_id_idx" ON "price_list_prices"("store_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "price_list_prices_price_list_id_variant_id_key" ON "price_list_prices"("price_list_id", "variant_id");

-- CreateIndex
CREATE INDEX "price_list_assignments_price_list_id_idx" ON "price_list_assignments"("price_list_id");

-- CreateIndex
CREATE INDEX "price_list_assignments_store_id_company_id_idx" ON "price_list_assignments"("store_id", "company_id");

-- CreateIndex
CREATE INDEX "price_list_assignments_store_id_company_location_id_idx" ON "price_list_assignments"("store_id", "company_location_id");

-- CreateIndex
CREATE INDEX "volume_pricing_rules_store_id_scope_scope_id_idx" ON "volume_pricing_rules"("store_id", "scope", "scope_id");

-- CreateIndex
CREATE INDEX "volume_pricing_rules_store_id_is_active_idx" ON "volume_pricing_rules"("store_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "quantity_rules_store_id_scope_scope_id_key" ON "quantity_rules"("store_id", "scope", "scope_id");

-- CreateIndex
CREATE INDEX "contract_prices_store_id_company_id_idx" ON "contract_prices"("store_id", "company_id");

-- CreateIndex
CREATE INDEX "contract_prices_store_id_company_location_id_idx" ON "contract_prices"("store_id", "company_location_id");

-- CreateIndex
CREATE INDEX "contract_prices_store_id_variant_id_idx" ON "contract_prices"("store_id", "variant_id");

-- AddForeignKey
ALTER TABLE "catalogs" ADD CONSTRAINT "catalogs_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogs" ADD CONSTRAINT "catalogs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_products" ADD CONSTRAINT "catalog_products_catalog_id_fkey" FOREIGN KEY ("catalog_id") REFERENCES "catalogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_products" ADD CONSTRAINT "catalog_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_assignments" ADD CONSTRAINT "catalog_assignments_catalog_id_fkey" FOREIGN KEY ("catalog_id") REFERENCES "catalogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_assignments" ADD CONSTRAINT "catalog_assignments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_assignments" ADD CONSTRAINT "catalog_assignments_company_location_id_fkey" FOREIGN KEY ("company_location_id") REFERENCES "company_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_prices" ADD CONSTRAINT "price_list_prices_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_prices" ADD CONSTRAINT "price_list_prices_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_assignments" ADD CONSTRAINT "price_list_assignments_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_assignments" ADD CONSTRAINT "price_list_assignments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_assignments" ADD CONSTRAINT "price_list_assignments_company_location_id_fkey" FOREIGN KEY ("company_location_id") REFERENCES "company_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volume_pricing_rules" ADD CONSTRAINT "volume_pricing_rules_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volume_pricing_rules" ADD CONSTRAINT "volume_pricing_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volume_pricing_rules" ADD CONSTRAINT "volume_pricing_rules_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quantity_rules" ADD CONSTRAINT "quantity_rules_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quantity_rules" ADD CONSTRAINT "quantity_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_prices" ADD CONSTRAINT "contract_prices_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_prices" ADD CONSTRAINT "contract_prices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_prices" ADD CONSTRAINT "contract_prices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_prices" ADD CONSTRAINT "contract_prices_company_location_id_fkey" FOREIGN KEY ("company_location_id") REFERENCES "company_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_prices" ADD CONSTRAINT "contract_prices_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- An assignment targets exactly one of a company or a company location, once each.
ALTER TABLE "catalog_assignments" ADD CONSTRAINT "catalog_assignments_one_target" CHECK (("company_id" IS NULL) <> ("company_location_id" IS NULL));
CREATE UNIQUE INDEX "catalog_assignments_catalog_company_key" ON "catalog_assignments"("catalog_id", "company_id") WHERE "company_id" IS NOT NULL;
CREATE UNIQUE INDEX "catalog_assignments_catalog_location_key" ON "catalog_assignments"("catalog_id", "company_location_id") WHERE "company_location_id" IS NOT NULL;
ALTER TABLE "price_list_assignments" ADD CONSTRAINT "price_list_assignments_one_target" CHECK (("company_id" IS NULL) <> ("company_location_id" IS NULL));
CREATE UNIQUE INDEX "price_list_assignments_list_company_key" ON "price_list_assignments"("price_list_id", "company_id") WHERE "company_id" IS NOT NULL;
CREATE UNIQUE INDEX "price_list_assignments_list_location_key" ON "price_list_assignments"("price_list_id", "company_location_id") WHERE "company_location_id" IS NOT NULL;

-- One contract price per variant per company (company-wide) or per location.
CREATE UNIQUE INDEX "contract_prices_company_variant_key" ON "contract_prices"("company_id", "variant_id") WHERE "company_location_id" IS NULL;
CREATE UNIQUE INDEX "contract_prices_location_variant_key" ON "contract_prices"("company_location_id", "variant_id") WHERE "company_location_id" IS NOT NULL;

ALTER TABLE "price_list_prices" ADD CONSTRAINT "price_list_prices_nonnegative" CHECK ("price" >= 0 AND ("compare_at_price" IS NULL OR "compare_at_price" >= 0));
ALTER TABLE "contract_prices" ADD CONSTRAINT "contract_prices_nonnegative" CHECK ("price" >= 0);
ALTER TABLE "contract_prices" ADD CONSTRAINT "contract_prices_valid_window" CHECK ("valid_from" IS NULL OR "valid_to" IS NULL OR "valid_from" < "valid_to");
ALTER TABLE "quantity_rules" ADD CONSTRAINT "quantity_rules_positive" CHECK (("min_quantity" IS NULL OR "min_quantity" >= 1) AND ("max_quantity" IS NULL OR "max_quantity" >= 1) AND ("increment" IS NULL OR "increment" >= 1) AND ("min_quantity" IS NULL OR "max_quantity" IS NULL OR "min_quantity" <= "max_quantity"));
ALTER TABLE "quantity_rules" ADD CONSTRAINT "quantity_rules_scope" CHECK ("scope" IN ('variant', 'product'));
ALTER TABLE "volume_pricing_rules" ADD CONSTRAINT "volume_pricing_rules_scope_id" CHECK (("scope" = 'store') = ("scope_id" IS NULL));
