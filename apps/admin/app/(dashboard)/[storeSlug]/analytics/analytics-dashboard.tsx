"use client";

import type { AnalyticsOverview, TopCompanyRow, TopCustomerRow, TopProductRow } from "@ocean/types";
import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, DataGrid, Input, Label, Skeleton } from "@ocean/ui";
import { useCallback, useEffect, useState } from "react";

import { api, API_URL, errorMessage, parseExportError } from "@/lib/api";
import { formatMoney } from "@/lib/money";

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function toRangeParams(from: string, to: string): string {
  const fromIso = new Date(`${from}T00:00:00.000Z`).toISOString();
  const toIso = new Date(`${to}T23:59:59.999Z`).toISOString();
  return `from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`;
}

export function AnalyticsDashboard({ storeId }: { storeId: string; currency: string }) {
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [topProducts, setTopProducts] = useState<TopProductRow[]>([]);
  const [topCustomers, setTopCustomers] = useState<TopCustomerRow[]>([]);
  const [topCompanies, setTopCompanies] = useState<TopCompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = toRangeParams(from, to);
      const [ov, products, customers, companies] = await Promise.all([
        api<{ data: AnalyticsOverview }>(`/stores/${storeId}/analytics/overview?${qs}`),
        api<{ data: TopProductRow[] }>(`/stores/${storeId}/analytics/top-products?${qs}`),
        api<{ data: TopCustomerRow[] }>(`/stores/${storeId}/analytics/top-customers?${qs}`),
        api<{ data: TopCompanyRow[] }>(`/stores/${storeId}/analytics/top-companies?${qs}`),
      ]);
      setOverview(ov.data);
      setTopProducts(products.data);
      setTopCustomers(customers.data);
      setTopCompanies(companies.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [storeId, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  async function exportCsv() {
    setExporting(true);
    setError(null);
    try {
      const qs = toRangeParams(from, to);
      const res = await fetch(`${API_URL}/admin/v1/stores/${storeId}/analytics/top-companies/export?${qs}`, {
        credentials: "include",
      });
      const text = await res.text();
      if (!res.ok) {
        // The body is the JSON error envelope, not CSV — surface it instead of downloading a
        // file named "top-companies.csv" that's actually an error message.
        setError(parseExportError(text));
        return;
      }
      const blob = new Blob([text], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "top-companies.csv";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const maxDay = Math.max(1, ...(overview?.revenueByDay.map((d) => d.revenue.amount) ?? [0]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">Revenue, top products and B2B reports.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="from">From</Label>
            <Input id="from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="to">To</Label>
            <Input id="to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        overview && (
          <>
            <section className="flex flex-col gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Sales overview</h2>
                <p className="text-sm text-muted-foreground">
                  Revenue, order volume and average order value for the selected range.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Revenue</CardDescription>
                    <CardTitle className="text-2xl tabular-nums">
                      {formatMoney(overview.revenue)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    {overview.orderCount} orders, cancelled excluded
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Average order value</CardDescription>
                    <CardTitle className="text-2xl tabular-nums">
                      {formatMoney(overview.averageOrderValue)}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Orders by status</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {overview.ordersByStatus.map((s) => (
                      <span key={s.status}>
                        {s.status}: <span className="font-medium text-foreground">{s.count}</span>
                      </span>
                    ))}
                    {overview.ordersByStatus.length === 0 && <span>No orders in range.</span>}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Revenue by day</CardTitle>
                </CardHeader>
                <CardContent>
                  {overview.revenueByDay.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No revenue in this range.</p>
                  ) : (
                    <div className="flex h-32 items-end gap-1">
                      {overview.revenueByDay.map((d) => (
                        <div
                          key={d.date}
                          className="group relative flex-1 rounded-t bg-primary/70 transition-colors hover:bg-primary"
                          style={{ height: `${Math.max(2, (d.revenue.amount / maxDay) * 100)}%` }}
                          title={`${d.date}: ${formatMoney(d.revenue)} (${d.orders} orders)`}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>

            <section className="flex flex-col gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Product performance</h2>
                <p className="text-sm text-muted-foreground">
                  Best-selling products by units and revenue in the selected range.
                </p>
              </div>
              <Card>
                <CardContent className="p-0">
                  <DataGrid
                    columns={[
                      { key: "title", header: "Product", cell: (r: TopProductRow) => r.title },
                      { key: "sku", header: "SKU", cell: (r: TopProductRow) => r.sku ?? "—" },
                      {
                        key: "qty",
                        header: "Units sold",
                        cell: (r: TopProductRow) => r.quantitySold,
                      },
                      {
                        key: "revenue",
                        header: "Revenue",
                        cell: (r: TopProductRow) => formatMoney(r.revenue),
                      },
                    ]}
                    rows={topProducts}
                    rowKey={(r) => r.productId ?? r.title}
                    empty={{ title: "No product sales in this range" }}
                  />
                </CardContent>
              </Card>
            </section>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <section className="flex flex-col gap-3">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">Customer performance</h2>
                  <p className="text-sm text-muted-foreground">
                    Direct (D2C) customers ranked by spend in the selected range.
                  </p>
                </div>
                <Card>
                  <CardContent className="p-0">
                    <DataGrid
                      columns={[
                        { key: "name", header: "Customer", cell: (r: TopCustomerRow) => r.name },
                        {
                          key: "orders",
                          header: "Orders",
                          cell: (r: TopCustomerRow) => r.orderCount,
                        },
                        {
                          key: "spent",
                          header: "Total spent",
                          cell: (r: TopCustomerRow) => formatMoney(r.totalSpent),
                        },
                      ]}
                      rows={topCustomers}
                      rowKey={(r) => r.customerId}
                      empty={{ title: "No customer orders in this range" }}
                    />
                  </CardContent>
                </Card>
              </section>

              <section className="flex flex-col gap-3">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">B2B performance</h2>
                  <p className="text-sm text-muted-foreground">
                    Companies ranked by order volume and spend in the selected range.
                  </p>
                </div>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-end pb-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void exportCsv()}
                      loading={exporting}
                    >
                      Export CSV
                    </Button>
                  </CardHeader>
                  <CardContent className="p-0">
                    <DataGrid
                      columns={[
                        { key: "name", header: "Company", cell: (r: TopCompanyRow) => r.name },
                        {
                          key: "orders",
                          header: "Orders",
                          cell: (r: TopCompanyRow) => r.orderCount,
                        },
                        {
                          key: "spent",
                          header: "Total spent",
                          cell: (r: TopCompanyRow) => formatMoney(r.totalSpent),
                        },
                      ]}
                      rows={topCompanies}
                      rowKey={(r) => r.companyId}
                      empty={{ title: "No company orders in this range" }}
                    />
                  </CardContent>
                </Card>
              </section>
            </div>

            <p className="text-xs text-muted-foreground">
              Marketing attribution, geographic sales, channel performance and inventory
              performance reports are not yet available — this system does not track ad spend,
              customer geography, sales channels, or inventory turnover.
            </p>
          </>
        )
      )}
    </div>
  );
}
