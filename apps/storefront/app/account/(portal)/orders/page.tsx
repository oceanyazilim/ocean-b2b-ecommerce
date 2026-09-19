import { Badge, EmptyState } from "@ocean/ui";
import Link from "next/link";

import { listAccountOrders } from "@/lib/account";
import { formatMoney } from "@/lib/money";

export default async function AccountOrdersPage() {
  const orders = await listAccountOrders(50);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>

      {orders.data.length === 0 ? (
        <EmptyState
          title="No orders yet"
          description="Orders placed on this account will show up here."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Payment</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orders.data.map((order) => (
                <tr key={order.id} className="hover:bg-accent/50">
                  <td className="px-4 py-3">
                    <Link href={`/account/orders/${order.id}`} className="font-medium hover:text-primary">
                      {order.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{order.status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{order.paymentStatus}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{formatMoney(order.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
