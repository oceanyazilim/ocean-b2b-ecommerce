-- L6 Global Localization (half A): market-specific legal content (spec section 46) and the
-- cookie/privacy consent framework (spec section 47). Additive only: a new nullable column on
-- pages, a new boolean on country_profiles (defaults to the GDPR/KVKK-style opt-in-required
-- rule so every existing country profile keeps behaving conservatively until reviewed), and
-- three new tables. No existing data is touched.

-- CreateEnum
CREATE TYPE "ConsentCategory" AS ENUM ('necessary', 'functional', 'analytics', 'marketing');

-- AlterTable
ALTER TABLE "country_profiles" ADD COLUMN     "consent_opt_in_required" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "pages" ADD COLUMN     "legal_requirement_code" TEXT;

-- CreateTable
CREATE TABLE "legal_page_requirements" (
    "id" UUID NOT NULL,
    "country_code" VARCHAR(2) NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "legal_page_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_scripts" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT,
    "category" "ConsentCategory" NOT NULL,
    "snippet" TEXT,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tracking_scripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "visitor_id" TEXT NOT NULL,
    "customer_id" UUID,
    "country_code" VARCHAR(2),
    "market_id" UUID,
    "necessary" BOOLEAN NOT NULL DEFAULT true,
    "functional" BOOLEAN NOT NULL DEFAULT false,
    "analytics" BOOLEAN NOT NULL DEFAULT false,
    "marketing" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "legal_page_requirements_country_code_idx" ON "legal_page_requirements"("country_code");

-- CreateIndex
CREATE UNIQUE INDEX "legal_page_requirements_country_code_code_key" ON "legal_page_requirements"("country_code", "code");

-- CreateIndex
CREATE INDEX "tracking_scripts_store_id_category_idx" ON "tracking_scripts"("store_id", "category");

-- CreateIndex
CREATE UNIQUE INDEX "tracking_scripts_store_id_name_key" ON "tracking_scripts"("store_id", "name");

-- CreateIndex
CREATE INDEX "consent_records_store_id_visitor_id_created_at_idx" ON "consent_records"("store_id", "visitor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "consent_records_store_id_customer_id_idx" ON "consent_records"("store_id", "customer_id");

-- CreateIndex
CREATE INDEX "pages_store_id_legal_requirement_code_idx" ON "pages"("store_id", "legal_requirement_code");

-- AddForeignKey
ALTER TABLE "tracking_scripts" ADD CONSTRAINT "tracking_scripts_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_scripts" ADD CONSTRAINT "tracking_scripts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
