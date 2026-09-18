import type {
  InventoryItemSummary,
  InventoryMovementReason,
  InventoryStockStatus,
  TransferStatus,
} from "@ocean/types";
import type { BadgeVariant } from "@ocean/ui";

export const REASON_LABELS: Record<InventoryMovementReason, string> = {
  adjustment: "Adjustment",
  transfer: "Transfer",
  return: "Return",
  damage: "Damage",
  count: "Stock count",
  fulfillment: "Fulfillment",
};

export const STOCK_STATUS: Record<InventoryStockStatus, { label: string; variant: BadgeVariant }> =
  {
    in_stock: { label: "In stock", variant: "success" },
    low: { label: "Low", variant: "warning" },
    out_of_stock: { label: "Out of stock", variant: "destructive" },
  };

export const TRANSFER_STATUS: Record<TransferStatus, { label: string; variant: BadgeVariant }> = {
  pending: { label: "Pending", variant: "warning" },
  approved: { label: "Approved", variant: "success" },
  rejected: { label: "Rejected", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "secondary" },
};

export function itemLabel(item: Pick<InventoryItemSummary, "variant" | "sku" | "upc">): string {
  if (item.variant) {
    return item.variant.title === "Default Title"
      ? item.variant.productTitle
      : `${item.variant.productTitle} — ${item.variant.title}`;
  }
  return item.sku ?? item.upc ?? "Untitled item";
}

export function formatWhen(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : "—";
}
