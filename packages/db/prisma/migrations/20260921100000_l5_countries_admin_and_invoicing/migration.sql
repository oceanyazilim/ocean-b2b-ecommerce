-- L5 Global Localization (half B): Platform Admin -> Countries + country-scoped feature flag
-- targets (spec sections 32/33), and merchant Finance -> Invoicing configuration + e-invoicing
-- provider connections (spec sections 28/29).
--
-- Hand-written (not `prisma migrate dev`) because this dev database's shadow-DB diff reported
-- pre-existing checksum drift on unrelated older migrations (20260919010000, 20260919070000 —
-- almost certainly Windows CRLF normalization on checkout, not a real schema mismatch) and
-- `migrate dev` demands a full `migrate reset` to proceed past that, which would drop this
-- shared dev database's data. This file mirrors exactly what Prisma would have generated for the
-- schema.prisma diff below.

-- CreateEnum
CREATE TYPE "EInvoiceProviderCategory" AS ENUM ('electronic_invoice_provider', 'government_tax_platform', 'certified_third_party', 'accounting_platform');
CREATE TYPE "EInvoiceConnectionStatus" AS ENUM ('disconnected', 'action_required', 'connected');

-- AlterTable: widen feature_flag_targets to a third, country-level target kind (spec section 33).
ALTER TABLE "feature_flag_targets" ADD COLUMN "country_code" VARCHAR(2);

-- Replace the two-way "exactly one of org/store" CHECK (feature_flag_targets_one_target, from
-- migration 20260919090000_platform_operator_role_and_flag_target_unique) with a three-way one.
ALTER TABLE "feature_flag_targets" DROP CONSTRAINT "feature_flag_targets_one_target";
ALTER TABLE "feature_flag_targets" ADD CONSTRAINT "feature_flag_targets_one_target" CHECK (
  ((("organization_id" IS NOT NULL))::int + (("store_id" IS NOT NULL))::int + (("country_code" IS NOT NULL))::int) = 1
);

ALTER TABLE "feature_flag_targets" ADD CONSTRAINT "feature_flag_targets_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "country_profiles"("country_code") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex (partial unique — Prisma's schema DSL has no WHERE-clause unique index, so this
-- isn't modeled in schema.prisma; see FeatureFlagTarget's comment there. Plain, non-partial
-- @@index([flagId, countryCode]) is modeled and created further below via the ordinary index.)
CREATE UNIQUE INDEX "feature_flag_targets_flag_country_key" ON "feature_flag_targets"("flag_id", "country_code") WHERE "country_code" IS NOT NULL;

-- CreateIndex
CREATE INDEX "feature_flag_targets_flag_id_country_code_idx" ON "feature_flag_targets"("flag_id", "country_code");

-- CreateTable
CREATE TABLE "invoice_settings" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "invoice_prefix" VARCHAR(20) NOT NULL DEFAULT 'INV-',
    "numbering_start" INTEGER,
    "legal_name" TEXT,
    "tax_id" TEXT,
    "registered_address" TEXT,
    "bank_info" JSONB,
    "footer_notice" TEXT,
    "currency" CHAR(3),
    "language" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invoice_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoice_settings_store_id_key" ON "invoice_settings"("store_id");

-- AddForeignKey
ALTER TABLE "invoice_settings" ADD CONSTRAINT "invoice_settings_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoice_settings" ADD CONSTRAINT "invoice_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "einvoice_provider_connections" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "category" "EInvoiceProviderCategory" NOT NULL,
    "provider_name" TEXT NOT NULL,
    "account_identifier" TEXT,
    "has_credential" BOOLEAN NOT NULL DEFAULT false,
    "status" "EInvoiceConnectionStatus" NOT NULL DEFAULT 'disconnected',
    "status_detail" TEXT,
    "connected_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "einvoice_provider_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "einvoice_provider_connections_store_id_category_key" ON "einvoice_provider_connections"("store_id", "category");

-- AddForeignKey
ALTER TABLE "einvoice_provider_connections" ADD CONSTRAINT "einvoice_provider_connections_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "einvoice_provider_connections" ADD CONSTRAINT "einvoice_provider_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
