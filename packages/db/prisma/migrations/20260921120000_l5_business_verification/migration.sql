-- L5 Global Localization: Business verification (spec section 30). Additive/nullable-where-it-
-- matters only, no existing columns touched, no data migration needed. verification_status
-- defaults to 'unverified' for every existing organization; OrganizationsService.
-- getBusinessVerification() recomputes and persists the real value the first time the Business
-- Verification settings page is read for that org.
CREATE TYPE "OrganizationVerificationStatus" AS ENUM ('unverified', 'action_required', 'verified');

ALTER TABLE "organizations"
  ADD COLUMN "verification_status" "OrganizationVerificationStatus" NOT NULL DEFAULT 'unverified',
  ADD COLUMN "verification_categories" JSONB,
  ADD COLUMN "verification_checked_at" TIMESTAMPTZ(6);
