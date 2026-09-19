import { Badge, EmptyState } from "@ocean/ui";
import Link from "next/link";

import { listAccountQuotes } from "@/lib/account";
import { formatMoney } from "@/lib/money";

export default async function AccountQuotesPage() {
  const quotes = await listAccountQuotes(50);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Quotes</h1>

      {quotes.data.length === 0 ? (
        <EmptyState
          title="No quotes yet"
          description="Price quotes your sales rep sends your company will show up here."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Quote</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Expires</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {quotes.data.map((quote) => (
                <tr key={quote.id} className="hover:bg-accent/50">
                  <td className="px-4 py-3">
                    <Link href={`/account/quotes/${quote.id}`} className="font-medium hover:text-primary">
                      {quote.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{quote.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {quote.expiresAt ? new Date(quote.expiresAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{formatMoney(quote.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
