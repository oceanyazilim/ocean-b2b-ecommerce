-- AlterEnum
ALTER TYPE "OrderSource" ADD VALUE 'quote';

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "quote_sequence" INTEGER NOT NULL DEFAULT 1000;
