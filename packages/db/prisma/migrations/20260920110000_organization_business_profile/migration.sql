-- Merchant business-profile onboarding (L2 of the localization initiative). Additive/nullable
-- only, driven entirely by the CountryProfile a merchant selects (country_code / entity type /
-- the schema-driven business_profile & business_address JSON answers) — no existing columns
-- touched, no data migration needed.
ALTER TABLE "organizations" ADD COLUMN "business_country_code" VARCHAR(2),
ADD COLUMN "business_entity_type" TEXT,
ADD COLUMN "business_profile" JSONB,
ADD COLUMN "business_address" JSONB,
ADD COLUMN "business_profile_completed_at" TIMESTAMPTZ(6);
