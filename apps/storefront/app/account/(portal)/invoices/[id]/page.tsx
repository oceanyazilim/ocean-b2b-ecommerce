import { Badge, Card, CardContent, CardHeader, CardTitle } from "@ocean/ui";
import { notFound } from "next/navigation";

import { getAccountInvoice } from "@/lib/account";
import { formatMoney } from "@/lib/money";

export default async function AccountInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await getAccountInvoice(id);
  if (!invoice) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{invoice.number}</h1>
          <p className="text-sm text-muted-foreground">
            Due {new Date(invoice.dueAt).toLocaleDateString()}
          </p>
        </div>
        <Badge variant="outline">{invoice.status}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Summary</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 pt-0 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Amount</span>
            <span>{formatMoney(invoice.amount)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Paid</span>
            <span>{formatMoney(invoice.paidAmount)}</span>
          </div>
          <div className="flex justify-between border-t pt-2 text-base font-semibold">
            <span>Balance</span>
            <span>{formatMoney(invoice.balance)}</span>
          </div>
        </CardContent>
      </Card>

      {invoice.payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payments</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-0 text-sm">
            {invoice.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between border-t pt-3 first:border-t-0 first:pt-0">
                <span className="text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}</span>
                <span className="font-medium">{formatMoney(p.amount)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
