"use client";

import type { B2BOverview, TopCompanyRow } from "@ocean/types";
import { Card, CardContent, CardHeader, CardTitle, DataGrid, Skeleton, type DataGridColumn } from "@ocean/ui";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { formatMoney } from "@/lib/money";

// Spec's B2B mode: "B2B Revenue, B2B Orders, Active Companies, Average B2B Order Value, Open
// Quotes, Outstanding Invoices, Available/Used Credit where applicable. Top companies table:
// Company, Market, Revenue, Orders, Outstanding Balance." Every figure comes from
// AnalyticsService.b2bOverview/topCompanies (real Order/Company/Quote/Invoice/CreditAccount data
// — see analytics.service.ts). Credit is shown per currency since this store's credit accounts
// aren't all guaranteed to share one currency; when there are no credit accounts at all, that's
// stated plainly rather than showing a fake zero.
export function B2BView({
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
  const t = useTranslations("dashboard.b2bMode");
  const [overview, setOverview] = useState<B2BOverview | null>(null);
  const [companies, setCompanies] = useState<TopCompanyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs =
      `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}` +
      (market !== "all" ? `&market=${encodeURIComponent(market)}` : "");
    // Two independent endpoints — a failure in one (e.g. no company orders yet, so no rows to
    // resolve markets/balances for) must not blank out the other.
    Promise.allSettled([
      api<{ data: B2BOverview }>(`/stores/${storeId}/analytics/b2b-overview?${qs}`),
      api<{ data: TopCompanyRow[] }>(`/stores/${storeId}/analytics/top-companies?${qs}&limit=10`),
    ]).then(([o, c]) => {
      if (cancelled) return;
      setOverview(o.status === "fulfilled" ? o.value.data : null);
      setCompanies(c.status === "fulfilled" ? c.value.data : []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [storeId, from, to, market]);

  const outstanding = overview?.outstandingInvoicesByCurrency ?? [];
  const credit = overview?.creditByCurrency ?? [];

  const columns: DataGridColumn<TopCompanyRow>[] = [
    {
      key: "company",
      header: t("company"),
      cell: (r) => (
        <Link href={`/${storeSlug}/companies/${r.companyId}`} className="font-medium hover:underline">
          {r.name}
        </Link>
      ),
    },
    { key: "market", header: t("market"), cell: (r) => r.market?.countryName ?? t("unknownMarket") },
    { key: "revenue", header: t("revenueCol"), className: "text-right", cell: (r) => formatMoney(r.totalSpent) },
    { key: "orders", header: t("ordersCol"), className: "text-right", cell: (r) => r.orderCount },
    {
      key: "outstanding",
      header: t("outstandingBalance"),
      className: "text-right",
      cell: (r) => (
        <span className={r.outstandingBalance.amount > 0 ? "text-warning" : undefined}>
          {formatMoney(r.outstandingBalance)}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">{t("title")}</h2>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label={t("revenue")} value={formatMoney(overview?.revenue)} />
          <Tile label={t("orders")} value={String(overview?.orderCount ?? 0)} />
          <Tile label={t("aov")} value={formatMoney(overview?.averageOrderValue)} />
          <Tile label={t("activeCompanies")} value={String(overview?.activeCompanies ?? 0)} />
          <Tile label={t("openQuotes")} value={String(overview?.openQuotes ?? 0)} />
          <Tile
            label={t("outstandingInvoices")}
            value={outstanding.length > 0 ? outstanding.map((o) => formatMoney(o.amount)).join(" / ") : formatMoney(undefined)}
          />
          <Tile
            label={t("availableCredit")}
            value={credit.length > 0 ? credit.map((c) => formatMoney(c.available)).join(" / ") : t("noCredit")}
          />
          <Tile
            label={t("usedCredit")}
            value={credit.length > 0 ? credit.map((c) => formatMoney(c.used)).join(" / ") : t("noCredit")}
          />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("topCompanies")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataGrid
            columns={columns}
            rows={companies}
            rowKey={(r) => r.companyId}
            loading={loading}
            empty={{ title: t("empty") }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 py-4">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xl font-semibold tabular-nums">{value}</span>
      </CardContent>
    </Card>
  );
}
