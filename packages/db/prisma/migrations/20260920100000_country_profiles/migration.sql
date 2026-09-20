-- Global Localization: Country Engine (L1 foundation). One platform-owned catalog table
-- (no tenant column, same pattern as themes/plans) — additive only, no existing tables touched.
CREATE TABLE "country_profiles" (
    "id" UUID NOT NULL,
    "country_code" VARCHAR(2) NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" VARCHAR(20) NOT NULL DEFAULT '2026.01',
    "supported_currencies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "supported_languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "address_schema" JSONB NOT NULL,
    "postal_code_rules" JSONB,
    "state_province_required" BOOLEAN NOT NULL DEFAULT false,
    "state_province_label" TEXT,
    "tax_system_type" TEXT NOT NULL,
    "tax_terminology" JSONB NOT NULL,
    "tax_id_formats" JSONB NOT NULL,
    "supported_payment_methods" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "business_entity_types" JSONB NOT NULL,
    "business_profile_schema" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "country_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "country_profiles_country_code_key" ON "country_profiles"("country_code");

-- CreateIndex
CREATE INDEX "country_profiles_is_active_idx" ON "country_profiles"("is_active");
