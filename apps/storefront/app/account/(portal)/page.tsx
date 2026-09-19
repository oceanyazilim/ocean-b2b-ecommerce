import { Badge, Card, CardContent, CardHeader, CardTitle } from "@ocean/ui";
import Link from "next/link";

import { getAccountProfile, listAccountCredit, listAccountOrders, listAccountQuotes } from "@/lib/account";
import { formatMoney } from "@/lib/money";

export default async function AccountDashboardPage() {
  const profile = await getAccountProfile();
  const membership = profile.companies[0] ?? null;
  const canSeeCredit = membership?.role === "company_admin" || membership?.role === "finance";

  const [orders, quotes, credit] = await Promise.all([
    listAccountOrders(5),
    membership ? listAccountQuotes(5) : Promise.resolve(null),
    canSeeCredit ? listAccountCredit() : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back, {profile.displayName.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground">{profile.email}</p>
      </div>

      {credit && credit.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          {credit.map((account) => (
            <Card key={account.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Available credit</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{formatMoney(account.available)}</p>
                <p className="text-xs text-muted-foreground">of {formatMoney(account.limit)} limit</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent orders</CardTitle>
          <Link href="/account/orders" className="text-sm font-medium text-primary hover:underline">
            View all
          </Link>
        </CardHeader>
        <CardContent>
          {orders.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">You haven&apos;t placed any orders yet.</p>
          ) : (
            <ul className="divide-y">
              {orders.data.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/account/orders/${order.id}`}
                    className="flex items-center justify-between py-3 text-sm hover:text-primary"
                  >
                    <span>
                      <span className="font-medium">{order.name}</span>
                      <span className="ml-2 text-muted-foreground">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <Badge variant="outline">{order.status}</Badge>
                      <span className="font-medium">{formatMoney(order.total)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {quotes && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Quotes</CardTitle>
            <Link href="/account/quotes" className="text-sm font-medium text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {quotes.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">No quotes yet.</p>
            ) : (
              <ul className="divide-y">
                {quotes.data.map((quote) => (
                  <li key={quote.id}>
                    <Link
                      href={`/account/quotes/${quote.id}`}
                      className="flex items-center justify-between py-3 text-sm hover:text-primary"
                    >
                      <span className="font-medium">{quote.number}</span>
                      <span className="flex items-center gap-3">
                        <Badge variant="outline">{quote.status}</Badge>
                        <span className="font-medium">{formatMoney(quote.total)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
