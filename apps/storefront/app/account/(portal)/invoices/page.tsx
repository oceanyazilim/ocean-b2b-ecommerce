import { Badge, EmptyState } from "@ocean/ui";
import Link from "next/link";

import { listAccountInvoices } from "@/lib/account";
import { formatMoney } from "@/lib/money";

const STATUS_VARIANT: Record<string, "outline" | "success" | "warning" | "destructive"> = {
  pending: "outline",
  paid: "success",
  overdue: "destructive",
  cancelled: "outline",
};

export default async function AccountInvoicesPage() {
  const invoices = await listAccountInvoices(50);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>

      {invoices.data.length === 0 ? (
        <EmptyState
          title="No invoices yet"
          description="Payment-terms invoices billed to your company will show up here."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3 font-medium">Due</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Balance</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {invoices.data.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-accent/50">
                  <td className="px-4 py-3">
                    <Link href={`/account/invoices/${invoice.id}`} className="font-medium hover:text-primary">
                      {invoice.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(invoice.dueAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[invoice.status] ?? "outline"}>{invoice.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{formatMoney(invoice.balance)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{formatMoney(invoice.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
