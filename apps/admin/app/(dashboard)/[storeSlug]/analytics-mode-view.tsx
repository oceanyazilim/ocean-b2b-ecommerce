"use client";

import type { TopCustomerRow, TopProductRow } from "@ocean/types";
import { Card, CardContent, CardHeader, CardTitle, DataGrid, type DataGridColumn } from "@ocean/ui";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { formatMoney } from "@/lib/money";

// The dashboard's Analytics mode is deliberately a preview, not a duplicate of the full Analytics
// page (which already covers country/market/currency breakdowns and CSV export — Phase 13/L6
// work). It reuses that page's own real endpoints (top-products/top-customers) and links out to
// the full page for the deeper drill-down, rather than re-implementing it here.
export function AnalyticsModeView({
  storeId,
  storeSlug,
  from,
  to,
  market,
}: {
  storeId: string;
  storeSlug: string;
  from: Date;
  to: Date;
  market: string;
}) {
  const t = useTranslations("dashboard.analyticsMode");
  const [products, setProducts] = useState<TopProductRow[]>([]);
  const [customers, setCustomers] = useState<TopCustomerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs =
      `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}&limit=8` +
      (market !== "all" ? `&market=${encodeURIComponent(market)}` : "");
    Promise.all([
      api<{ data: TopProductRow[] }>(`/stores/${storeId}/analytics/top-products?${qs}`),
      api<{ data: TopCustomerRow[] }>(`/stores/${storeId}/analytics/top-customers?${qs}`),
    ])
      .then(([p, c]) => {
        if (cancelled) return;
        setProducts(p.data);
        setCustomers(c.data);
      })
      .catch(() => {
        if (!cancelled) {
          setProducts([]);
          setCustomers([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId, from, to, market]);

  const productColumns: DataGridColumn<TopProductRow>[] = [
    { key: "title", header: t("product"), cell: (r) => r.title },
    { key: "qty", header: t("sold"), className: "text-right", cell: (r) => r.quantitySold },
    { key: "revenue", header: t("revenue"), className: "text-right", cell: (r) => formatMoney(r.revenue) },
  ];
  const customerColumns: DataGridColumn<TopCustomerRow>[] = [
    { key: "name", header: t("customer"), cell: (r) => r.name },
    { key: "orders", header: t("orders"), className: "text-right", cell: (r) => r.orderCount },
    { key: "spent", header: t("totalSpent"), className: "text-right", cell: (r) => formatMoney(r.totalSpent) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <Link href={`/${storeSlug}/analytics`} className="text-sm text-primary hover:underline">
          {t("viewFull")}
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("topProducts")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataGrid
              columns={productColumns}
              rows={products}
              rowKey={(r) => r.productId ?? r.title}
              loading={loading}
              empty={{ title: t("empty") }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("topCustomers")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataGrid
              columns={customerColumns}
              rows={customers}
              rowKey={(r) => r.customerId}
              loading={loading}
              empty={{ title: t("empty") }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
