"use client";

import type {
  CompanyStats,
  InventoryStats,
  OperationsSummary,
  OrderStats,
  QuoteStats,
} from "@ocean/types";
import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton } from "@ocean/ui";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { formatMoney } from "@/lib/money";

interface Permissions {
  orders: boolean;
  inventory: boolean;
  companies: boolean;
  quotes: boolean;
}

// Spec's Operations mode: "orders requiring action, fulfillment, returns, inventory, failed
// payments, pending B2B approvals, overdue invoices, open quotes... highly actionable." The
// aggregate tiles reuse the exact same stats this session's Overview "Needs attention" section
// already fetches (real OrderStats/InventoryStats/CompanyStats/QuoteStats) and link to the same
// filtered list views. Returns/failed payments/overdue invoices have no store-wide filtered list
// page in this codebase yet, so their rows link straight to the order (or invoice's order) where
// the action actually happens — genuinely clickable, just per-row instead of per-aggregate.
export function OperationsView({
  storeId,
  storeSlug,
  permissions,
  orderStats,
  inventoryStats,
  companyStats,
  quoteStats,
  statsLoading,
}: {
  storeId: string;
  storeSlug: string;
  permissions: Permissions;
  orderStats: OrderStats | null;
  inventoryStats: InventoryStats | null;
  companyStats: CompanyStats | null;
  quoteStats: QuoteStats | null;
  statsLoading: boolean;
}) {
  const t = useTranslations("dashboard.operationsMode");
  const [summary, setSummary] = useState<OperationsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<{ data: OperationsSummary }>(`/stores/${storeId}/analytics/operations-summary`)
      .then((res) => {
        if (!cancelled) setSummary(res.data);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  const tiles: { label: string; count: number; href: string }[] = [];
  if (permissions.orders && orderStats) {
    tiles.push({ label: t("toFulfill"), count: orderStats.toFulfill, href: `/${storeSlug}/orders?view=builtin:unfulfilled` });
    tiles.push({ label: t("awaitingPayment"), count: orderStats.awaitingPayment, href: `/${storeSlug}/orders?view=builtin:unpaid` });
  }
  if (permissions.inventory && inventoryStats) {
    tiles.push({ label: t("lowStock"), count: inventoryStats.lowStock, href: `/${storeSlug}/inventory?status=low` });
  }
  if (permissions.companies && companyStats) {
    tiles.push({ label: t("pendingApplications"), count: companyStats.pendingApplications, href: `/${storeSlug}/companies/applications` });
  }
  if (permissions.quotes && quoteStats) {
    tiles.push({ label: t("openQuotes"), count: quoteStats.awaitingResponse, href: `/${storeSlug}/quotes` });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {statsLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {tiles.map((tile) => (
            <Link key={tile.label} href={tile.href}>
              <Card className="h-full transition-colors hover:bg-accent">
                <CardContent className="flex flex-col gap-1 py-4">
                  <span className="text-xs text-muted-foreground">{tile.label}</span>
                  <span className="flex items-center gap-2 text-xl font-semibold tabular-nums">
                    <Badge variant={tile.count > 0 ? "warning" : "secondary"}>{tile.count}</Badge>
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ActionQueueCard
          title={t("returns")}
          count={summary?.returns.count ?? 0}
          loading={loading}
        >
          {summary?.returns.items.map((r) => (
            <li key={r.id}>
              <Link href={`/${storeSlug}/orders/${r.orderId}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-accent">
                <span>
                  <span className="font-medium">{r.orderName}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{r.reason}</span>
                </span>
                <Badge variant="warning">{r.status}</Badge>
              </Link>
            </li>
          ))}
        </ActionQueueCard>

        <ActionQueueCard
          title={t("failedPayments")}
          hint={t("failedPaymentsHint")}
          count={summary?.failedPayments.count ?? 0}
          loading={loading}
        >
          {summary?.failedPayments.items.map((p) => (
            <li key={p.id}>
              <Link href={`/${storeSlug}/orders/${p.orderId}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-accent">
                <span>
                  <span className="font-medium">{p.orderName}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{p.failureReason ?? p.provider}</span>
                </span>
                <span className="tabular-nums text-destructive">{formatMoney(p.amount)}</span>
              </Link>
            </li>
          ))}
        </ActionQueueCard>

        <ActionQueueCard
          title={t("overdueInvoices")}
          count={summary?.overdueInvoices.count ?? 0}
          loading={loading}
        >
          {summary?.overdueInvoices.items.map((i) => (
            <li key={i.id}>
              <Link href={`/${storeSlug}/orders/${i.orderId}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-accent">
                <span>
                  <span className="font-medium">{i.number}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{i.companyName}</span>
                </span>
                <span className="tabular-nums text-destructive">{formatMoney(i.balance)}</span>
              </Link>
            </li>
          ))}
        </ActionQueueCard>
      </div>
    </div>
  );
}

function ActionQueueCard({
  title,
  hint,
  count,
  loading,
  children,
}: {
  title: string;
  hint?: string;
  count: number;
  loading: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("dashboard.operationsMode");
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="text-sm">{title}</CardTitle>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        <Badge variant={count > 0 ? "warning" : "secondary"}>{count}</Badge>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : count === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{t("noItems")}</p>
        ) : (
          <ul className="divide-y">{children}</ul>
        )}
      </CardContent>
    </Card>
  );
}
