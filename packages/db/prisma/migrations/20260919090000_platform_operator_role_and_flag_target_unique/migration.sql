-- Code-review fix pass on apps/platform-admin + apps/api's platform module:
--  1. PlatformOperator had status (active/suspended) but no role/scope, so every active operator
--     could hit every mutating platform route. Adds a role enum, defaulting new/existing rows to
--     the least-privileged "viewer" so nobody is silently upgraded by this migration.
--  2. PlatformFeatureFlagsService.setTarget() did an unsynchronized findFirst-then-create/update
--     with no unique constraint backing it, so two concurrent requests could both insert a target
--     row for the same (flag, organization|store). A target is exactly one of org-level or
--     store-level (SetFeatureFlagTargetInput's zod refine already enforces this at the API layer);
--     this adds the same CHECK + two partial unique indexes CatalogAssignment/PriceListAssignment
--     use for the identical "one-of-two nullable FKs" shape elsewhere in this schema, so the
--     database itself rejects a duplicate/conflicting row instead of relying on app-level locking.

-- CreateEnum
CREATE TYPE "PlatformOperatorRole" AS ENUM ('viewer', 'operator', 'admin');

-- AlterTable
ALTER TABLE "platform_operators" ADD COLUMN "role" "PlatformOperatorRole" NOT NULL DEFAULT 'viewer';

-- A target is exactly one of org-level or store-level, never both, never neither.
ALTER TABLE "feature_flag_targets" ADD CONSTRAINT "feature_flag_targets_one_target" CHECK (("organization_id" IS NULL) <> ("store_id" IS NULL));

-- CreateIndex (partial unique — Prisma's schema DSL has no WHERE-clause unique index, so these
-- aren't modeled in schema.prisma; see the model's comment there)
CREATE UNIQUE INDEX "feature_flag_targets_flag_org_key" ON "feature_flag_targets"("flag_id", "organization_id") WHERE "organization_id" IS NOT NULL;
CREATE UNIQUE INDEX "feature_flag_targets_flag_store_key" ON "feature_flag_targets"("flag_id", "store_id") WHERE "store_id" IS NOT NULL;
