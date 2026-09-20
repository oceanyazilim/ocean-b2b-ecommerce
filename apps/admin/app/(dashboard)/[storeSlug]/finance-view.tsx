"use client";

import type { RevenueBreakdown } from "@ocean/types";
import { Alert, Card, CardContent, CardHeader, CardTitle, Skeleton } from "@ocean/ui";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { formatMoney } from "@/lib/money";

// Spec's Finance mode: "Gross Sales, Discounts, Refunds, Tax, Payment Provider Fees, Shipping
// Revenue, Net Revenue, Payouts, Estimated Profit... payout timeline... upcoming payout
// information." This codebase has real Order/Refund/Tax data (reused from
// AnalyticsService.revenueBreakdown, the same source as the Overview "Revenue breakdown" card)
// but genuinely no Payouts or payment-provider-fee tracking: no live PSP integration exists here,
// only PaymentsService's manual payment adapter (see Payments module) — there's no fee percentage,
// no payout schedule and no payout ledger anywhere in this schema. Rather than fabricate those
// numbers, this view shows the real figures and labels the two missing sections plainly.
export function FinanceView({
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
  const t = useTranslations("dashboard.financeMode");
  const tb = useTranslations("dashboard.revenueBreakdown");
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

  const rows: { label: string; value: string }[] = data
    ? [
        { label: tb("grossSales"), value: formatMoney(data.grossSales) },
        { label: tb("discounts"), value: `-${formatMoney(data.discounts)}` },
        { label: tb("refunds"), value: `-${formatMoney(data.refunds)}` },
        { label: tb("shippingRevenue"), value: formatMoney(data.shippingRevenue) },
        { label: tb("cogs"), value: `-${formatMoney(data.costOfGoodsSold)}` },
      ]
    : [];

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">{t("title")}</h2>

      {loading ? (
        <Skeleton className="h-56 w-full" />
      ) : !data ? (
        <p className="text-sm text-muted-foreground">{tb("empty")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">{tb("title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-2 text-sm">
                {rows.map((r) => (
                  <div key={r.label} className="flex items-center justify-between">
                    <dt className="text-muted-foreground">{r.label}</dt>
                    <dd className="tabular-nums">{r.value}</dd>
                  </div>
                ))}
                <div className="my-1 border-t" />
                <div className="flex items-center justify-between font-semibold">
                  <dt>{tb("netRevenue")}</dt>
                  <dd className="tabular-nums">{formatMoney(data.netRevenue)}</dd>
                </div>
                <div className="flex items-center justify-between font-semibold">
                  <dt>{tb("grossProfit")}</dt>
                  <dd className="tabular-nums">
                    {data.estimatedGrossProfit ? formatMoney(data.estimatedGrossProfit) : "—"}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                {tb("taxNote", { amount: formatMoney(data.taxCollected) })}
              </p>
              {data.itemsWithCost === 0 ? (
                <p className="text-xs text-muted-foreground">{tb("profitUnavailable")}</p>
              ) : data.itemsMissingCost > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {tb("profitPartialNote", { withCost: data.itemsWithCost, total: data.itemsWithCost + data.itemsMissingCost })}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("payments")}</CardTitle>
              </CardHeader>
              <CardContent>
                <Alert variant="info">{t("paymentsUnavailable")}</Alert>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("payouts")}</CardTitle>
              </CardHeader>
              <CardContent>
                <Alert variant="info">{t("payoutsUnavailable")}</Alert>
                <p className="mt-2 text-xs text-muted-foreground">{t("gapNote")}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
