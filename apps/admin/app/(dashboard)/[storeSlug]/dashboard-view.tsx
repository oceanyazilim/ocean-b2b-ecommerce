"use client";

import type {
  AnalyticsOverview,
  CompanyStats,
  InventoryStats,
  NotificationSummary,
  OrderStats,
  Paginated,
  QuoteStats,
} from "@ocean/types";
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, Select, Skeleton, Tabs } from "@ocean/ui";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { api, errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/money";

type RangeKey = "today" | "7d" | "30d" | "90d" | "custom";
type ComparisonBasis = "previous_period" | "previous_year";
type ChartMetric = "gross" | "net" | "orders" | "aov" | "refunds";

interface Permissions {
  orders: boolean;
  analytics: boolean;
  inventory: boolean;
  companies: boolean;
  quotes: boolean;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function currentRange(
  key: RangeKey,
  customFrom: string,
  customTo: string,
): { from: Date; to: Date } {
  const now = new Date();
  if (key === "custom") {
    const from = customFrom ? startOfDay(new Date(`${customFrom}T00:00:00`)) : startOfDay(now);
    const to = customTo ? endOfDay(new Date(`${customTo}T00:00:00`)) : endOfDay(now);
    return { from, to };
  }
  const days = key === "today" ? 0 : key === "7d" ? 6 : key === "30d" ? 29 : 89;
  return { from: startOfDay(new Date(now.getTime() - days * 86400000)), to: endOfDay(now) };
}

function comparisonRange(
  basis: ComparisonBasis,
  from: Date,
  to: Date,
): { from: Date; to: Date } {
  if (basis === "previous_year") {
    const f = new Date(from);
    f.setFullYear(f.getFullYear() - 1);
    const t = new Date(to);
    t.setFullYear(t.getFullYear() - 1);
    return { from: f, to: t };
  }
  const lengthMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  return { from: new Date(prevTo.getTime() - lengthMs), to: prevTo };
}

function dayKeys(from: Date, to: Date): string[] {
  const days: string[] = [];
  const cur = startOfDay(from);
  const end = startOfDay(to);
  let guard = 0;
  while (cur.getTime() <= end.getTime() && guard < 400) {
    days.push(toDateInput(cur));
    cur.setDate(cur.getDate() + 1);
    guard += 1;
  }
  return days;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null; // null = "new", not a finite % change
  return ((current - previous) / previous) * 100;
}

function ChangeBadge({ pct }: { pct: number | null }) {
  const t = useTranslations("dashboard.metrics");
  if (pct === null) return <span className="text-xs text-muted-foreground">{t("new")}</span>;
  const flat = Math.abs(pct) < 0.05;
  const up = pct > 0;
  return (
    <span
      className={
        "text-xs font-medium tabular-nums " +
        (flat ? "text-muted-foreground" : up ? "text-success" : "text-destructive")
      }
    >
      {flat ? "→" : up ? "↑" : "↓"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const range = max - min || 1;
  const w = 100;
  const h = 28;
  const step = w / (values.length - 1);
  const points = values
    .map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-full text-primary" preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MetricCard({
  label,
  value,
  pct,
  comparisonLabel,
  sparkline,
  unavailable,
  note,
}: {
  label: string;
  value: string;
  pct?: number | null | undefined;
  comparisonLabel?: string | undefined;
  sparkline?: number[] | undefined;
  unavailable?: boolean | undefined;
  note?: string | undefined;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 py-4">
        <span className="text-xs text-muted-foreground">{label}</span>
        {unavailable ? (
          <>
            <span className="text-xl font-semibold text-muted-foreground">—</span>
            <span className="text-xs text-muted-foreground">{note}</span>
          </>
        ) : (
          <>
            <span className="text-xl font-semibold tabular-nums">{value}</span>
            <div className="flex items-center gap-1.5">
              {pct !== undefined && <ChangeBadge pct={pct} />}
              {comparisonLabel && (
                <span className="text-xs text-muted-foreground">{comparisonLabel}</span>
              )}
            </div>
            {sparkline && sparkline.length > 1 && <Sparkline values={sparkline} />}
            {note && <span className="text-xs text-muted-foreground">{note}</span>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface AttentionItem {
  label: string;
  count: number;
  severity: "info" | "warning";
  href: string;
}

// Maps a notification's machine `type` to its translation key under dashboard.notificationTypes.
// Any type not listed here falls back to the notification's own (untranslated, server-sent)
// title — same fallback behavior as before this key existed.
const NOTIFICATION_LABEL_KEY: Record<string, string> = {
  "order.created": "orderCreated",
  "quote.accepted": "quoteAccepted",
  "company_application.submitted": "companyApplicationSubmitted",
  "return.requested": "returnRequested",
};

type ActivityTranslator = (key: string, values?: Record<string, number>) => string;

function timeAgo(iso: string, t: ActivityTranslator): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return t("justNow");
  if (min < 60) return t("minutesAgo", { count: min });
  const hr = Math.round(min / 60);
  if (hr < 24) return t("hoursAgo", { count: hr });
  const day = Math.round(hr / 24);
  return t("daysAgo", { count: day });
}

export function DashboardView({
  storeId,
  storeSlug,
  storeName,
  currency,
  userName,
  permissions,
}: {
  storeId: string;
  storeSlug: string;
  storeName: string;
  currency: string;
  userName: string;
  permissions: Permissions;
}) {
  const [rangeKey, setRangeKey] = useState<RangeKey>("30d");
  const [customFrom, setCustomFrom] = useState(toDateInput(new Date(Date.now() - 29 * 86400000)));
  const [customTo, setCustomTo] = useState(toDateInput(new Date()));
  const [basis, setBasis] = useState<ComparisonBasis>("previous_period");
  const [chartMetric, setChartMetric] = useState<ChartMetric>("gross");
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const [greetingKey, setGreetingKey] = useState<"morning" | "afternoon" | "evening" | "hello">("hello");

  const t = useTranslations("dashboard");
  const tActivity = useTranslations("dashboard.activity");
  const tNotificationTypes = useTranslations("dashboard.notificationTypes");

  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [previousOverview, setPreviousOverview] = useState<AnalyticsOverview | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  const [orderStats, setOrderStats] = useState<OrderStats | null>(null);
  const [inventoryStats, setInventoryStats] = useState<InventoryStats | null>(null);
  const [companyStats, setCompanyStats] = useState<CompanyStats | null>(null);
  const [quoteStats, setQuoteStats] = useState<QuoteStats | null>(null);
  const [notifications, setNotifications] = useState<NotificationSummary[]>([]);
  const [attentionLoading, setAttentionLoading] = useState(true);

  useEffect(() => {
    const h = new Date().getHours();
    setGreetingKey(h < 12 ? "morning" : h < 18 ? "afternoon" : "evening");
  }, []);

  const { from, to } = useMemo(
    () => currentRange(rangeKey, customFrom, customTo),
    [rangeKey, customFrom, customTo],
  );
  const cmp = useMemo(() => comparisonRange(basis, from, to), [basis, from, to]);

  useEffect(() => {
    if (!permissions.analytics) {
      setAnalyticsLoading(false);
      return;
    }
    let cancelled = false;
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    const qs = (f: Date, t: Date) =>
      `from=${encodeURIComponent(f.toISOString())}&to=${encodeURIComponent(t.toISOString())}`;
    Promise.all([
      api<{ data: AnalyticsOverview }>(`/stores/${storeId}/analytics/overview?${qs(from, to)}`),
      api<{ data: AnalyticsOverview }>(
        `/stores/${storeId}/analytics/overview?${qs(cmp.from, cmp.to)}`,
      ),
    ])
      .then(([cur, prev]) => {
        if (cancelled) return;
        setOverview(cur.data);
        setPreviousOverview(prev.data);
      })
      .catch((err) => {
        if (!cancelled) setAnalyticsError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setAnalyticsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId, permissions.analytics, from, to, cmp]);

  useEffect(() => {
    let cancelled = false;
    setAttentionLoading(true);
    Promise.all([
      permissions.orders
        ? api<{ data: OrderStats }>(`/stores/${storeId}/orders/stats`)
        : Promise.resolve(null),
      permissions.inventory
        ? api<{ data: InventoryStats }>(`/stores/${storeId}/inventory/stats`)
        : Promise.resolve(null),
      permissions.companies
        ? api<{ data: CompanyStats }>(`/stores/${storeId}/companies/stats`)
        : Promise.resolve(null),
      permissions.quotes
        ? api<{ data: QuoteStats }>(`/stores/${storeId}/quotes/stats`)
        : Promise.resolve(null),
      api<Paginated<NotificationSummary>>(`/stores/${storeId}/notifications?limit=8`).catch(
        () => null,
      ),
    ])
      .then(([o, i, c, q, n]) => {
        if (cancelled) return;
        if (o) setOrderStats(o.data);
        if (i) setInventoryStats(i.data);
        if (c) setCompanyStats(c.data);
        if (q) setQuoteStats(q.data);
        if (n) setNotifications(n.data);
      })
      .finally(() => {
        if (!cancelled) setAttentionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId, permissions.orders, permissions.inventory, permissions.companies, permissions.quotes]);

  const days = useMemo(() => dayKeys(from, to), [from, to]);
  const series = useMemo(() => {
    if (!overview) return [];
    const revMap = new Map(overview.revenueByDay.map((d) => [d.date, d]));
    const refMap = new Map(overview.refundsByDay.map((d) => [d.date, d]));
    return days.map((date) => {
      const rev = revMap.get(date);
      const ref = refMap.get(date);
      const gross = rev?.revenue.amount ?? 0;
      const orders = rev?.orders ?? 0;
      const refunds = ref?.refunds.amount ?? 0;
      return {
        date,
        gross,
        orders,
        aov: orders > 0 ? Math.round(gross / orders) : 0,
        refunds,
        net: gross - refunds,
      };
    });
  }, [overview, days]);

  const maxSeries = Math.max(1, ...series.map((d) => d[chartMetric]));
  const hovered = series.find((d) => d.date === hoveredDay) ?? null;

  const comparisonLabel =
    basis === "previous_year" ? t("comparison.previousYear") : t("comparison.previousPeriod");

  const attention: AttentionItem[] = [];
  if (permissions.orders && orderStats) {
    attention.push({
      label: t("attention.toFulfill"),
      count: orderStats.toFulfill,
      severity: orderStats.toFulfill > 0 ? "warning" : "info",
      href: `/${storeSlug}/orders?view=builtin:unfulfilled`,
    });
  }
  if (permissions.inventory && inventoryStats) {
    attention.push({
      label: t("attention.lowStock"),
      count: inventoryStats.lowStock,
      severity: inventoryStats.lowStock > 0 ? "warning" : "info",
      href: `/${storeSlug}/inventory?status=low`,
    });
  }
  if (permissions.companies && companyStats) {
    attention.push({
      label: t("attention.pendingApplications"),
      count: companyStats.pendingApplications,
      severity: companyStats.pendingApplications > 0 ? "warning" : "info",
      href: `/${storeSlug}/companies/applications`,
    });
  }
  if (permissions.quotes && quoteStats) {
    attention.push({
      label: t("attention.quotesAwaiting"),
      count: quoteStats.awaitingResponse,
      severity: quoteStats.awaitingResponse > 0 ? "warning" : "info",
      href: `/${storeSlug}/quotes`,
    });
  }

  const revenuePct = previousOverview
    ? pctChange(overview?.revenue.amount ?? 0, previousOverview.revenue.amount)
    : undefined;
  const netPct = previousOverview
    ? pctChange(overview?.netRevenue.amount ?? 0, previousOverview.netRevenue.amount)
    : undefined;
  const ordersPct = previousOverview
    ? pctChange(overview?.orderCount ?? 0, previousOverview.orderCount)
    : undefined;
  const aovPct = previousOverview
    ? pctChange(overview?.averageOrderValue.amount ?? 0, previousOverview.averageOrderValue.amount)
    : undefined;
  const returningPct =
    previousOverview &&
    isPresent(overview?.returningCustomerRate) &&
    isPresent(previousOverview.returningCustomerRate)
      ? pctChange(overview.returningCustomerRate, previousOverview.returningCustomerRate)
      : undefined;

  const grossSparkline = series.map((d) => d.gross);
  const netSparkline = series.map((d) => d.net);
  const ordersSparkline = series.map((d) => d.orders);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t(`greeting.${greetingKey}`)}, {userName.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("subtitle", { storeName, currency })}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Tabs
            aria-label={t("dateRange.ariaLabel")}
            value={rangeKey}
            onChange={(v) => setRangeKey(v as RangeKey)}
            items={[
              { value: "today", label: t("dateRange.today") },
              { value: "7d", label: t("dateRange.sevenDays") },
              { value: "30d", label: t("dateRange.thirtyDays") },
              { value: "90d", label: t("dateRange.ninetyDays") },
              { value: "custom", label: t("dateRange.custom") },
            ]}
          />
          {rangeKey === "custom" && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={customFrom}
                max={customTo}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                aria-label={t("dateRange.fromDate")}
              />
              <span className="text-xs text-muted-foreground">{t("dateRange.to")}</span>
              <input
                type="date"
                value={customTo}
                min={customFrom}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                aria-label={t("dateRange.toDate")}
              />
            </div>
          )}
        </div>
      </div>

      {!permissions.analytics && !permissions.orders && (
        <Alert variant="info">{t("noAccess")}</Alert>
      )}
      {analyticsError && <Alert variant="error">{analyticsError}</Alert>}

      {permissions.analytics && (
        <>
          <div className="flex items-center justify-end">
            <Select
              value={basis}
              onChange={(e) => setBasis(e.target.value as ComparisonBasis)}
              className="w-44"
              aria-label={t("comparison.ariaLabel")}
            >
              <option value="previous_period">{t("comparison.previousPeriod")}</option>
              <option value="previous_year">{t("comparison.previousYear")}</option>
            </Select>
          </div>

          {analyticsLoading ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <MetricCard
                label={t("metrics.totalSales")}
                value={formatMoney(overview?.revenue ?? { amount: 0, currency })}
                pct={revenuePct}
                comparisonLabel={comparisonLabel}
                sparkline={grossSparkline}
              />
              <MetricCard
                label={t("metrics.netSales")}
                value={formatMoney(overview?.netRevenue ?? { amount: 0, currency })}
                pct={netPct}
                comparisonLabel={comparisonLabel}
                sparkline={netSparkline}
                note={
                  overview && overview.refunds.amount > 0
                    ? t("metrics.netSalesNote", { amount: formatMoney(overview.refunds) })
                    : undefined
                }
              />
              <MetricCard
                label={t("metrics.orders")}
                value={String(overview?.orderCount ?? 0)}
                pct={ordersPct}
                comparisonLabel={comparisonLabel}
                sparkline={ordersSparkline}
              />
              <MetricCard
                label={t("metrics.averageOrderValue")}
                value={formatMoney(overview?.averageOrderValue ?? { amount: 0, currency })}
                pct={aovPct}
                comparisonLabel={comparisonLabel}
              />
              <MetricCard
                label={t("metrics.returningCustomerRate")}
                value={
                  isPresent(overview?.returningCustomerRate)
                    ? `${(overview.returningCustomerRate * 100).toFixed(1)}%`
                    : "—"
                }
                pct={returningPct}
                comparisonLabel={isPresent(overview?.returningCustomerRate) ? comparisonLabel : undefined}
                unavailable={!isPresent(overview?.returningCustomerRate)}
                note={
                  !isPresent(overview?.returningCustomerRate)
                    ? t("metrics.returningNoData")
                    : t("metrics.returningKnownOnly")
                }
              />
              <MetricCard
                label={t("metrics.conversionRate")}
                value="—"
                unavailable
                note={t("metrics.conversionNotTracked")}
              />
            </div>
          )}

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">{t("chart.title")}</CardTitle>
              <Select
                value={chartMetric}
                onChange={(e) => setChartMetric(e.target.value as ChartMetric)}
                className="w-40"
                aria-label={t("chart.metricAriaLabel")}
              >
                <option value="gross">{t("chart.gross")}</option>
                <option value="net">{t("chart.net")}</option>
                <option value="orders">{t("chart.orders")}</option>
                <option value="aov">{t("chart.aov")}</option>
                <option value="refunds">{t("chart.refunds")}</option>
              </Select>
            </CardHeader>
            <CardContent>
              {analyticsLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : series.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("chart.noData")}</p>
              ) : (
                <>
                  <div className="mb-2 text-xs text-muted-foreground">
                    {hovered ? (
                      <span>
                        <span className="font-medium text-foreground">{hovered.date}</span> ·
                        {chartMetric === "orders"
                          ? ` ${t("chart.ordersCount", { count: hovered.orders })}`
                          : ` ${formatMoney({ amount: hovered[chartMetric], currency: overview?.currency ?? currency })}`}
                      </span>
                    ) : (
                      <span>{t("chart.hoverHint")}</span>
                    )}
                  </div>
                  <div
                    className="flex h-36 items-end gap-0.5"
                    onMouseLeave={() => setHoveredDay(null)}
                  >
                    {series.map((d) => (
                      <div
                        key={d.date}
                        role="presentation"
                        className={
                          "group relative flex-1 rounded-t transition-colors " +
                          (hoveredDay === d.date ? "bg-primary" : "bg-primary/60 hover:bg-primary")
                        }
                        style={{ height: `${Math.max(2, (d[chartMetric] / maxSeries) * 100)}%` }}
                        onMouseEnter={() => setHoveredDay(d.date)}
                        title={`${d.date}: ${
                          chartMetric === "orders"
                            ? t("chart.ordersCount", { count: d.orders })
                            : formatMoney({ amount: d[chartMetric], currency: overview?.currency ?? currency })
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("attention.title")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {attentionLoading ? (
              <div className="flex flex-col gap-2 p-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : attention.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">{t("attention.empty")}</p>
            ) : (
              <ul className="divide-y">
                {attention.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-accent"
                    >
                      <span className="flex items-center gap-2">
                        <Badge variant={item.severity === "warning" ? "warning" : "info"}>
                          {item.count}
                        </Badge>
                        <span>{item.label}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {item.count > 0 ? t("attention.review") : t("attention.allClear")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("activity.title")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {attentionLoading ? (
              <div className="flex flex-col gap-2 p-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : notifications.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">{t("activity.empty")}</p>
            ) : (
              <ul className="divide-y">
                {notifications.map((n) => {
                  const labelKey = NOTIFICATION_LABEL_KEY[n.type];
                  return (
                    <li key={n.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                      <div>
                        <div className="font-medium">
                          {labelKey ? tNotificationTypes(labelKey) : n.title}
                        </div>
                        <div className="text-xs text-muted-foreground">{n.body}</div>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {timeAgo(n.createdAt, tActivity)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
