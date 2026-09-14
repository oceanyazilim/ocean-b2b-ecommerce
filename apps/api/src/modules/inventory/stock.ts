import { LOW_STOCK_THRESHOLD, type InventoryStockStatus } from "@ocean/types";

export interface StockBuckets {
  quantity: number;
  reserved: number;
  damaged: number;
}

// Units that can still be sold: physically present, not held for an order, not damaged.
export function availableOf(b: StockBuckets): number {
  return b.quantity - b.reserved - b.damaged;
}

export function stockStatus(available: number): InventoryStockStatus {
  if (available <= 0) return "out_of_stock";
  if (available <= LOW_STOCK_THRESHOLD) return "low";
  return "in_stock";
}

// How many units a location can give up (to a transfer, a removal or the damaged bucket).
export function removableFrom(b: StockBuckets): number {
  return Math.max(0, availableOf(b));
}
