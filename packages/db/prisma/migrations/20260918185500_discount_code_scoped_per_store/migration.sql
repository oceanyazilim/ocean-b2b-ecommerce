-- AlterTable: add store_id, backfilled from the parent discount (scoped uniqueness, not global)
ALTER TABLE "discount_codes" ADD COLUMN "store_id" UUID;

UPDATE "discount_codes" dc
SET "store_id" = d."store_id"
FROM "discounts" d
WHERE d."id" = dc."discount_id";

ALTER TABLE "discount_codes" ALTER COLUMN "store_id" SET NOT NULL;

-- DropIndex
DROP INDEX "discount_codes_code_key";

-- CreateIndex
CREATE UNIQUE INDEX "discount_codes_store_id_code_key" ON "discount_codes"("store_id", "code");
