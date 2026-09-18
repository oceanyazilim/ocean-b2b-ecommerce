-- AlterEnum
ALTER TYPE "InventoryMovementReason" ADD VALUE 'fulfillment';

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "prices_include_tax" BOOLEAN NOT NULL DEFAULT false;
