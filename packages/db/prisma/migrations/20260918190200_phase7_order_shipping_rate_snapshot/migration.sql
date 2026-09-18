-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "shipping_rate_id" UUID,
ADD COLUMN     "shipping_rate_name" TEXT;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_rate_id_fkey" FOREIGN KEY ("shipping_rate_id") REFERENCES "shipping_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
