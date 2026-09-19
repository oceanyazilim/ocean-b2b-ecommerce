import type { OrderDetail } from "@ocean/types";

import { api, errorMessage } from "@/lib/api";

export interface BulkResult {
  succeeded: number;
  failed: { id: string; message: string }[];
}

// Every bulk action below is a thin loop over a real, already-existing single-order endpoint —
// the same request the order detail page's own buttons send — run once per selected row. There
// is no dedicated bulk API; this is the honest way to offer "12 selected -> do X" without
// inventing backend behavior that doesn't exist.
async function runBulk(
  orderIds: string[],
  fn: (id: string) => Promise<void>,
): Promise<BulkResult> {
  const result: BulkResult = { succeeded: 0, failed: [] };
  for (const id of orderIds) {
    try {
      await fn(id);
      result.succeeded += 1;
    } catch (err) {
      result.failed.push({ id, message: errorMessage(err) });
    }
  }
  return result;
}

// Fulfils every remaining shippable line at the store's default location — identical to what the
// order detail page's "Fulfil items" dialog sends with every remaining line pre-filled to its
// full remaining quantity.
export function bulkMarkFulfilled(storeId: string, orderIds: string[]): Promise<BulkResult> {
  return runBulk(orderIds, async (id) => {
    const { data: order } = await api<{ data: OrderDetail }>(`/stores/${storeId}/orders/${id}`);
    const lines = order.items
      .filter((i) => i.requiresShipping && i.fulfilledQuantity < i.quantity)
      .map((i) => ({ orderItemId: i.id, quantity: i.quantity - i.fulfilledQuantity }));
    if (lines.length === 0) throw new Error("Nothing left to fulfil");
    await api(`/stores/${storeId}/orders/${id}/fulfillments`, {
      body: { items: lines, trackingCarrier: null, trackingNumber: null },
    });
  });
}

// Confirms every pending payment on the order — the same action as the Payments panel's
// "Confirm" button.
export function bulkConfirmPayments(storeId: string, orderIds: string[]): Promise<BulkResult> {
  return runBulk(orderIds, async (id) => {
    const { data: order } = await api<{ data: OrderDetail }>(`/stores/${storeId}/orders/${id}`);
    const pending = order.payments.filter((p) => p.status === "pending");
    if (pending.length === 0) throw new Error("No pending payment");
    for (const p of pending) {
      await api(`/stores/${storeId}/orders/${id}/payments/${p.id}/confirm`, { body: {} });
    }
  });
}

export function bulkCancel(
  storeId: string,
  orderIds: string[],
  reason: string,
): Promise<BulkResult> {
  return runBulk(orderIds, (id) =>
    api(`/stores/${storeId}/orders/${id}/cancel`, { body: { reason, restock: true } }).then(
      () => undefined,
    ),
  );
}
