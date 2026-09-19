import { Badge, Card, CardContent, CardHeader, CardTitle } from "@ocean/ui";
import { notFound } from "next/navigation";

import { getAccountQuote } from "@/lib/account";
import { formatMoney } from "@/lib/money";

export default async function AccountQuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quote = await getAccountQuote(id);
  if (!quote) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{quote.number}</h1>
          <p className="text-sm text-muted-foreground">
            {quote.expiresAt
              ? `Expires ${new Date(quote.expiresAt).toLocaleDateString()}`
              : "No expiration date"}
          </p>
        </div>
        <Badge variant="outline">{quote.status}</Badge>
      </div>

      {quote.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes from your sales rep</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-muted-foreground">{quote.notes}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Line items</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ul className="divide-y">
            {quote.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="text-muted-foreground">
                    {item.sku ? `SKU ${item.sku} · ` : ""}
                    Qty {item.quantity} × {formatMoney(item.unitPrice)}
                    {item.discount.amount > 0 ? ` · -${formatMoney(item.discount)}` : ""}
                  </p>
                </div>
                <p className="whitespace-nowrap font-medium">{formatMoney(item.lineTotal)}</p>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-between border-t pt-4 text-base font-semibold">
            <span>Total</span>
            <span>{formatMoney(quote.total)}</span>
          </div>
        </CardContent>
      </Card>

      {quote.status === "accepted" && (
        <p className="text-sm text-muted-foreground">
          This quote has been accepted and is being converted into an order by your sales rep.
        </p>
      )}
      {quote.convertedOrderId && (
        <p className="text-sm text-muted-foreground">
          This quote has already been converted into an order.
        </p>
      )}
    </div>
  );
}
