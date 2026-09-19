import type { FulfillmentStatus, OrderStatus, PaymentStatus } from "@ocean/types";

// The filter combination behind a saved view. Everything here maps onto the order list's
// existing server-side query params (see orderListQuerySchema in packages/types), except
// `minTotal`: there is no min-total query param yet, so "High value" is applied client-side
// against the rows already fetched for the active server-side filters.
export interface OrderViewFilters {
  q: string;
  status: OrderStatus | "";
  open: boolean;
  paymentStatus: PaymentStatus | "";
  fulfillmentStatus: FulfillmentStatus | "";
  minTotal: number | null;
}

export const EMPTY_FILTERS: OrderViewFilters = {
  q: "",
  status: "",
  open: false,
  paymentStatus: "",
  fulfillmentStatus: "",
  minTotal: null,
};

export interface SavedView {
  id: string;
  name: string;
  builtin: boolean;
  filters: OrderViewFilters;
}

// Built-in presets, matching the spec's "All / Unfulfilled / Unpaid / Open / Closed / Cancelled"
// vocabulary, mapped to fields that actually exist on this system's Order model
// (packages/db/prisma/schema.prisma): OrderStatus (incl. the phase-12 B2B approval workflow's
// `pending_approval`), PaymentStatus, FulfillmentStatus and total. "Closed" maps to `completed` —
// there's no separate "closed" flag on Order, and `completed` is the terminal non-cancelled
// status. Pending approval and High value are additional store-specific views kept from before
// this pass (they're real, useful and don't collide with the spec's vocabulary), appended after
// the six spec tabs rather than removed.
export const BUILTIN_VIEWS: SavedView[] = [
  {
    id: "builtin:all",
    name: "All",
    builtin: true,
    filters: { ...EMPTY_FILTERS },
  },
  {
    id: "builtin:unfulfilled",
    name: "Unfulfilled",
    builtin: true,
    filters: { ...EMPTY_FILTERS, open: true, fulfillmentStatus: "unfulfilled" },
  },
  {
    id: "builtin:unpaid",
    name: "Unpaid",
    builtin: true,
    filters: { ...EMPTY_FILTERS, open: true, paymentStatus: "pending" },
  },
  {
    id: "builtin:open",
    name: "Open",
    builtin: true,
    filters: { ...EMPTY_FILTERS, open: true },
  },
  {
    id: "builtin:closed",
    name: "Closed",
    builtin: true,
    filters: { ...EMPTY_FILTERS, status: "completed" },
  },
  {
    id: "builtin:cancelled",
    name: "Cancelled",
    builtin: true,
    filters: { ...EMPTY_FILTERS, status: "cancelled" },
  },
  {
    id: "builtin:pending_approval",
    name: "Pending approval",
    builtin: true,
    filters: { ...EMPTY_FILTERS, status: "pending_approval" },
  },
  {
    id: "builtin:high_value",
    name: "High value",
    builtin: true,
    filters: { ...EMPTY_FILTERS, minTotal: 100000 },
  },
];

export const DEFAULT_VIEW_ID = "builtin:open";

const STORAGE_PREFIX = "ocean:admin:orders-saved-views";

// Scoped per store so switching stores (or logging into a different tenant in the same browser)
// never shows or applies another store's saved views/filters.
function viewsKey(storeId: string) {
  return `${STORAGE_PREFIX}:${storeId}`;
}
function activeKey(storeId: string) {
  return `${STORAGE_PREFIX}:active:${storeId}`;
}

function isOrderViewFilters(value: unknown): value is OrderViewFilters {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.q === "string" &&
    typeof v.status === "string" &&
    typeof v.open === "boolean" &&
    typeof v.paymentStatus === "string" &&
    typeof v.fulfillmentStatus === "string" &&
    (v.minTotal === null || typeof v.minTotal === "number")
  );
}

function isSavedView(value: unknown): value is SavedView {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.name === "string" && isOrderViewFilters(v.filters);
}

export function loadCustomViews(storeId: string): SavedView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(viewsKey(storeId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSavedView).map((v) => ({ ...v, builtin: false }));
  } catch {
    return [];
  }
}

export function saveCustomViews(storeId: string, views: SavedView[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(viewsKey(storeId), JSON.stringify(views));
  } catch {
    // Storage may be unavailable (private browsing, quota exceeded) — saved views just won't
    // persist for this session, which is a reasonable degradation for a purely client-side feature.
  }
}

export function loadActiveViewId(storeId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(activeKey(storeId));
  } catch {
    return null;
  }
}

export function saveActiveViewId(storeId: string, id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(activeKey(storeId), id);
  } catch {
    // ignore
  }
}
