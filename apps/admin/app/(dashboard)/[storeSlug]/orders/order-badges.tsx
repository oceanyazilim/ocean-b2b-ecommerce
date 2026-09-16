import type { FulfillmentStatus, OrderStatus, PaymentStatus, PriceSourceKind } from "@ocean/types";
import { Badge, type BadgeVariant } from "@ocean/ui";

const ORDER: Record<OrderStatus, BadgeVariant> = {
  pending_approval: "warning",
  confirmed: "default",
  processing: "default",
  completed: "success",
  cancelled: "secondary",
};
const PAYMENT: Record<PaymentStatus, BadgeVariant> = {
  pending: "warning",
  authorized: "default",
  paid: "success",
  partially_paid: "warning",
  partially_refunded: "secondary",
  refunded: "secondary",
  voided: "secondary",
};
const FULFILLMENT: Record<FulfillmentStatus, BadgeVariant> = {
  unfulfilled: "warning",
  partially_fulfilled: "default",
  fulfilled: "success",
};

const label = (s: string) => s.replace(/_/g, " ");

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge variant={ORDER[status]}>{label(status)}</Badge>;
}
export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge variant={PAYMENT[status]}>{label(status)}</Badge>;
}
export function FulfillmentStatusBadge({ status }: { status: FulfillmentStatus }) {
  return <Badge variant={FULFILLMENT[status]}>{label(status)}</Badge>;
}

export const PRICE_SOURCE_LABEL: Record<PriceSourceKind, string> = {
  contract: "Contract price",
  price_list: "Price list",
  volume: "Volume tier",
  base: "Base price",
  custom: "Custom price",
};
