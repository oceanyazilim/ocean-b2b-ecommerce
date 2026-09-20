-- Global Localization: Country & Tax Compliance (L3 of the localization initiative, spec
-- sections 20-27). Builds on top of the real Phase 7 tax rate engine ("tax_rules") and the L1
-- Country Engine ("country_profiles") without replacing either. Entirely additive: new tables
-- (tax_registrations, tax_classes) and nullable columns only, so existing tax rules, products
-- and companies behave exactly as before until a merchant opts in.

-- CreateEnum
CREATE TYPE "TaxRegistrationStatus" AS ENUM ('active', 'not_registered', 'pending');

-- CreateEnum
CREATE TYPE "TaxIdValidationStatus" AS ENUM ('unverified', 'verified', 'invalid');

-- AlterTable: products get an optional tax class (spec section 24). No class = "Standard",
-- matched only by tax_rules that also have no tax_class_id, i.e. today's behavior.
ALTER TABLE "products" ADD COLUMN "tax_class_id" UUID;

-- AlterTable: tax_rules can optionally target one tax class instead of applying to every line
-- at that geography.
ALTER TABLE "tax_rules" ADD COLUMN "tax_class_id" UUID;

-- AlterTable: B2B tax information on companies (spec sections 26-27). tax_number/tax_office
-- already existed; these add the country, the tax-id format code (for the dynamic on-screen
-- label), a merchant-set validation status and a free-text tax-treatment note.
ALTER TABLE "companies" ADD COLUMN "tax_country_code" VARCHAR(2),
ADD COLUMN "tax_id_type" TEXT,
ADD COLUMN "tax_validation_status" "TaxIdValidationStatus" NOT NULL DEFAULT 'unverified',
ADD COLUMN "tax_treatment" TEXT;

-- CreateTable
CREATE TABLE "tax_registrations" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "country_code" VARCHAR(2) NOT NULL,
    "region_code" TEXT,
    "registration_type" TEXT NOT NULL,
    "registration_number" TEXT,
    "status" "TaxRegistrationStatus" NOT NULL DEFAULT 'not_registered',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tax_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_classes" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tax_classes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_store_id_tax_class_id_idx" ON "products"("store_id", "tax_class_id");

-- CreateIndex
CREATE INDEX "tax_rules_store_id_tax_class_id_idx" ON "tax_rules"("store_id", "tax_class_id");

-- CreateIndex
CREATE INDEX "tax_registrations_store_id_country_code_idx" ON "tax_registrations"("store_id", "country_code");

-- CreateIndex
CREATE UNIQUE INDEX "tax_classes_store_id_code_key" ON "tax_classes"("store_id", "code");

-- CreateIndex
CREATE INDEX "tax_classes_store_id_idx" ON "tax_classes"("store_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tax_class_id_fkey" FOREIGN KEY ("tax_class_id") REFERENCES "tax_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rules" ADD CONSTRAINT "tax_rules_tax_class_id_fkey" FOREIGN KEY ("tax_class_id") REFERENCES "tax_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_registrations" ADD CONSTRAINT "tax_registrations_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_registrations" ADD CONSTRAINT "tax_registrations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_classes" ADD CONSTRAINT "tax_classes_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_classes" ADD CONSTRAINT "tax_classes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
