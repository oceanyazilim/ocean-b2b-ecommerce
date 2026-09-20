"use client";

import type { RevenueBreakdown } from "@ocean/types";
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from "@ocean/ui";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { formatMoney } from "@/lib/money";

// Spec: "Create a clear financial summary... Use visual hierarchy. Do not treat taxes as
// revenue." A stepped breakdown (each step's bar is scaled against gross sales) rather than a
// classic waterfall chart — simpler to build correctly and just as legible for a handful of rows.
// Every figure here is real (Order/Refund/OrderItem/ProductVariant.cost); nothing is invented.
export function RevenueBreakdownCard({
  storeId,
  from,
  to,
  market,
}: {
  storeId: string;
  from: Date;
  to: Date;
  market: string;
}) {
  const t = useTranslations("dashboard.revenueBreakdown");
  const [data, setData] = useState<RevenueBreakdown | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs =
      `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}` +
      (market !== "all" ? `&market=${encodeURIComponent(market)}` : "");
    api<{ data: RevenueBreakdown }>(`/stores/${storeId}/analytics/revenue-breakdown?${qs}`)
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId, from, to, market]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : !data || data.grossSales.amount === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <BreakdownBody data={data} />
        )}
      </CardContent>
    </Card>
  );
}

function BreakdownBody({ data }: { data: RevenueBreakdown }) {
  const t = useTranslations("dashboard.revenueBreakdown");
  const basis = Math.max(1, data.grossSales.amount);

  const rows: { label: string; value: number; money: { amount: number; currency: string }; tone: "pos" | "neg" | "neutral" }[] = [
    { label: t("grossSales"), value: data.grossSales.amount, money: data.grossSales, tone: "pos" },
    { label: t("discounts"), value: -data.discounts.amount, money: data.discounts, tone: "neg" },
    { label: t("refunds"), value: -data.refunds.amount, money: data.refunds, tone: "neg" },
    { label: t("shippingRevenue"), value: data.shippingRevenue.amount, money: data.shippingRevenue, tone: "pos" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3">
            <span className="w-36 shrink-0 text-sm text-muted-foreground">{r.label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={
                  "h-full rounded-full " + (r.tone === "neg" ? "bg-destructive" : "bg-primary")
                }
                style={{ width: `${Math.min(100, (Math.abs(r.value) / basis) * 100)}%` }}
              />
            </div>
            <span
              className={
                "w-28 shrink-0 text-right text-sm tabular-nums font-medium " +
                (r.tone === "neg" && r.money.amount > 0 ? "text-destructive" : "")
              }
            >
              {r.tone === "neg" && r.money.amount > 0 ? "−" : ""}
              {formatMoney(r.money)}
            </span>
          </div>
        ))}
        <div className="my-1 border-t" />
        <div className="flex items-center gap-3">
          <span className="w-36 shrink-0 text-sm font-semibold">{t("netRevenue")}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-success"
              style={{ width: `${Math.min(100, (Math.abs(data.netRevenue.amount) / basis) * 100)}%` }}
            />
          </div>
          <span className="w-28 shrink-0 text-right text-sm tabular-nums font-semibold">
            {formatMoney(data.netRevenue)}
          </span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{t("taxNote", { amount: formatMoney(data.taxCollected) })}</p>

      <div className="flex flex-col gap-1 rounded-md border p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t("cogs")}</span>
          <span className="tabular-nums">{formatMoney(data.costOfGoodsSold)}</span>
        </div>
        <div className="flex items-center justify-between text-sm font-medium">
          <span>{t("grossProfit")}</span>
          <span className="tabular-nums">
            {data.estimatedGrossProfit ? formatMoney(data.estimatedGrossProfit) : "—"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {data.itemsWithCost === 0
            ? t("profitUnavailable")
            : data.itemsMissingCost > 0
              ? t("profitPartialNote", { withCost: data.itemsWithCost, total: data.itemsWithCost + data.itemsMissingCost })
              : null}
        </p>
      </div>
    </div>
  );
}
