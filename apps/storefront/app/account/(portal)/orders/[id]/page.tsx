import { formatAddressLines } from "@ocean/types";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@ocean/ui";
import { notFound } from "next/navigation";

import { getAccountOrder } from "@/lib/account";
import { formatMoney } from "@/lib/money";

export default async function AccountOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getAccountOrder(id);
  if (!order) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{order.name}</h1>
          <p className="text-sm text-muted-foreground">
            Placed {new Date(order.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline">{order.status}</Badge>
          <Badge variant="outline">{order.paymentStatus}</Badge>
          <Badge variant="outline">{order.fulfillmentStatus}</Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ul className="divide-y">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="text-muted-foreground">
                    {item.variantTitle !== "Default Title" ? `${item.variantTitle} · ` : ""}
                    {item.sku ? `SKU ${item.sku} · ` : ""}
                    Qty {item.quantity}
                  </p>
                </div>
                <p className="whitespace-nowrap font-medium">{formatMoney(item.lineTotal)}</p>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col gap-1 border-t pt-4 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatMoney(order.totals.subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Shipping</span>
              <span>{formatMoney(order.totals.shippingTotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Tax</span>
              <span>{formatMoney(order.totals.taxTotal)}</span>
            </div>
            {order.totals.discountTotal.amount > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Discount</span>
                <span>-{formatMoney(order.totals.discountTotal)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span>{formatMoney(order.totals.total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 sm:grid-cols-2">
        {order.shippingAddress && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Shipping address</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-muted-foreground">
              {formatAddressLines(order.shippingAddress).map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </CardContent>
          </Card>
        )}
        {order.billingAddress && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Billing address</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-muted-foreground">
              {formatAddressLines(order.billingAddress).map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {order.fulfillments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fulfillment</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-0 text-sm">
            {order.fulfillments.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 first:border-t-0 first:pt-0">
                <div>
                  <Badge variant="outline">{f.status}</Badge>
                  {f.trackingNumber && (
                    <span className="ml-2 text-muted-foreground">
                      Tracking: {f.trackingCarrier ? `${f.trackingCarrier} ` : ""}
                      {f.trackingNumber}
                    </span>
                  )}
                </div>
                {f.shippedAt && (
                  <span className="text-muted-foreground">Shipped {new Date(f.shippedAt).toLocaleDateString()}</span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {order.payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payments</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-0 text-sm">
            {order.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between border-t pt-3 first:border-t-0 first:pt-0">
                <span>
                  {p.methodName} <Badge variant="outline">{p.status}</Badge>
                </span>
                <span className="font-medium">{formatMoney(p.amount)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
