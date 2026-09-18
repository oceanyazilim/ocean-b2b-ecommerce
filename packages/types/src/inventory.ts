import { z } from "zod";

import { cursorPaginationQuerySchema } from "./api";
import { idSchema } from "./primitives";

// ---- locations --------------------------------------------------------------------------------

export const LOCATION_TYPES = ["warehouse", "store", "storage"] as const;
export const locationTypeSchema = z.enum(LOCATION_TYPES);
export type LocationType = z.infer<typeof locationTypeSchema>;

const locationFields = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  type: locationTypeSchema,
  address: z.string().trim().max(500).nullable().optional(),
  isDefault: z.boolean(),
  isActive: z.boolean(),
});

export const locationInputSchema = locationFields.extend({
  type: locationTypeSchema.default("warehouse"),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
export type LocationInput = z.infer<typeof locationInputSchema>;

// Derived from the default-free shape so a PATCH never resets fields the caller left out.
export const updateLocationSchema = locationFields.partial();
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;

export interface LocationSummary {
  id: string;
  name: string;
  type: LocationType;
  address: string | null;
  isDefault: boolean;
  isActive: boolean;
  stockedItemCount: number;
  createdAt: string;
  updatedAt: string;
}

// ---- items & levels ---------------------------------------------------------------------------

export const INVENTORY_TRACKING_TYPES = ["variant", "sku", "upc"] as const;
export const inventoryTrackingTypeSchema = z.enum(INVENTORY_TRACKING_TYPES);
export type InventoryTrackingType = z.infer<typeof inventoryTrackingTypeSchema>;

const code = z.string().trim().min(1).max(64);

// An item is identified by a product variant, or by a bare SKU / UPC for goods that are not
// (yet) in the catalog. The tracking type is derived from whichever identifier leads.
export const inventoryItemInputSchema = z
  .object({
    productVariantId: idSchema.nullable().optional(),
    sku: code.nullable().optional(),
    upc: code.nullable().optional(),
  })
  .refine((v) => !!v.productVariantId || !!v.sku || !!v.upc, {
    message: "Choose a variant or enter a SKU or UPC",
    path: ["productVariantId"],
  });
export type InventoryItemInput = z.infer<typeof inventoryItemInputSchema>;

export const LOW_STOCK_THRESHOLD = 5;

export const INVENTORY_STOCK_STATUSES = ["in_stock", "low", "out_of_stock"] as const;
export const inventoryStockStatusSchema = z.enum(INVENTORY_STOCK_STATUSES);
export type InventoryStockStatus = z.infer<typeof inventoryStockStatusSchema>;

export const inventoryListQuerySchema = cursorPaginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
  locationId: idSchema.optional(),
  status: inventoryStockStatusSchema.optional(),
});
export type InventoryListQuery = z.infer<typeof inventoryListQuerySchema>;

export const variantSearchQuerySchema = z.object({
  q: z.string().trim().max(120).default(""),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type VariantSearchQuery = z.infer<typeof variantSearchQuerySchema>;

export interface InventoryVariantCandidate {
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  sku: string | null;
  tracked: boolean;
}

export interface InventoryLevelSummary {
  locationId: string;
  locationName: string;
  locationActive: boolean;
  quantity: number;
  reserved: number;
  damaged: number;
  available: number;
  lastMovedAt: string | null;
}

export interface InventoryItemSummary {
  id: string;
  trackingType: InventoryTrackingType;
  sku: string | null;
  upc: string | null;
  variant: {
    id: string;
    title: string;
    productId: string;
    productTitle: string;
    image: { url: string; alt: string | null } | null;
  } | null;
  onHand: number;
  committed: number;
  reserved: number;
  damaged: number;
  available: number;
  stockStatus: InventoryStockStatus;
  lastMovedAt: string | null;
  createdAt: string;
}

export interface InventoryItemDetail extends InventoryItemSummary {
  levels: InventoryLevelSummary[];
}

export interface InventoryStats {
  itemCount: number;
  totalOnHand: number;
  lowStock: number;
  outOfStock: number;
  locationCount: number;
}

// ---- movements --------------------------------------------------------------------------------

export const INVENTORY_MOVEMENT_REASONS = [
  "adjustment",
  "transfer",
  "return",
  "damage",
  "count",
  "fulfillment",
] as const;
export const inventoryMovementReasonSchema = z.enum(INVENTORY_MOVEMENT_REASONS);
export type InventoryMovementReason = z.infer<typeof inventoryMovementReasonSchema>;

export const ADJUSTMENT_REASONS = ["adjustment", "return", "damage", "count"] as const;
export const adjustmentReasonSchema = z.enum(ADJUSTMENT_REASONS);
export type AdjustmentReason = z.infer<typeof adjustmentReasonSchema>;

const movementNotes = {
  reference: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
};

// Either a relative change (`delta`) or, for stocktakes, an absolute count (`quantity`).
// A `damage` reason moves units between the sellable and damaged buckets of the same location.
export const inventoryAdjustmentSchema = z
  .object({
    itemId: idSchema,
    locationId: idSchema,
    delta: z.number().int().optional(),
    quantity: z.number().int().min(0).optional(),
    reason: adjustmentReasonSchema.default("adjustment"),
    ...movementNotes,
  })
  .refine((v) => (v.delta !== undefined) !== (v.quantity !== undefined), {
    message: "Provide either delta or quantity",
    path: ["delta"],
  })
  .refine((v) => v.delta === undefined || v.delta !== 0, {
    message: "Delta cannot be zero",
    path: ["delta"],
  })
  .refine((v) => v.reason !== "count" || v.quantity !== undefined, {
    message: "A stock count needs an absolute quantity",
    path: ["quantity"],
  });
export type InventoryAdjustmentInput = z.infer<typeof inventoryAdjustmentSchema>;

export const inventoryTransferSchema = z
  .object({
    itemId: idSchema,
    fromLocationId: idSchema,
    toLocationId: idSchema,
    quantity: z.number().int().positive("Quantity must be at least 1"),
    ...movementNotes,
  })
  .refine((v) => v.fromLocationId !== v.toLocationId, {
    message: "Choose two different locations",
    path: ["toLocationId"],
  });
export type InventoryTransferInput = z.infer<typeof inventoryTransferSchema>;

export const movementListQuerySchema = cursorPaginationQuerySchema.extend({
  itemId: idSchema.optional(),
  locationId: idSchema.optional(),
  reason: inventoryMovementReasonSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type MovementListQuery = z.infer<typeof movementListQuerySchema>;

export interface InventoryMovementEntry {
  id: string;
  item: { id: string; sku: string | null; title: string };
  fromLocation: { id: string; name: string } | null;
  toLocation: { id: string; name: string } | null;
  quantity: number;
  reason: InventoryMovementReason;
  source: "manual" | "system" | "import";
  reference: string | null;
  notes: string | null;
  actor: { id: string; name: string } | null;
  createdAt: string;
}

// ---- transfer requests ------------------------------------------------------------------------

export const TRANSFER_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;
export const transferStatusSchema = z.enum(TRANSFER_STATUSES);
export type TransferStatus = z.infer<typeof transferStatusSchema>;

export const transferRequestInputSchema = z
  .object({
    itemId: idSchema,
    fromLocationId: idSchema,
    toLocationId: idSchema,
    quantity: z.number().int().positive("Quantity must be at least 1"),
  })
  .refine((v) => v.fromLocationId !== v.toLocationId, {
    message: "Choose two different locations",
    path: ["toLocationId"],
  });
export type TransferRequestInput = z.infer<typeof transferRequestInputSchema>;

export const transferDecisionSchema = z
  .object({
    status: z.enum(["approved", "rejected", "cancelled"]),
    rejectionReason: z.string().trim().max(500).nullable().optional(),
  })
  .refine((v) => v.status !== "rejected" || !!v.rejectionReason, {
    message: "Say why the transfer was rejected",
    path: ["rejectionReason"],
  });
export type TransferDecisionInput = z.infer<typeof transferDecisionSchema>;

export const transferListQuerySchema = cursorPaginationQuerySchema.extend({
  status: transferStatusSchema.optional(),
});
export type TransferListQuery = z.infer<typeof transferListQuerySchema>;

export interface TransferRequestSummary {
  id: string;
  item: { id: string; sku: string | null; title: string };
  fromLocation: { id: string; name: string };
  toLocation: { id: string; name: string };
  quantity: number;
  status: TransferStatus;
  requestedBy: { id: string; name: string } | null;
  approvedBy: { id: string; name: string } | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}
