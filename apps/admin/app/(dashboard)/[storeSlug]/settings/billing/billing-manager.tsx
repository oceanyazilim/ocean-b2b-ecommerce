"use client";

import type {
  FeatureFlagSummary,
  PlanSummary,
  PlatformInvoiceSummary,
  SubscriptionDetail,
} from "@ocean/types";
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, ConfirmDialog, Skeleton } from "@ocean/ui";
import { useCallback, useEffect, useState } from "react";

import { api, errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { useSubmit } from "@/lib/use-submit";

const STATUS_VARIANT: Record<string, "success" | "warning" | "secondary" | "destructive"> = {
  trialing: "warning",
  active: "success",
  past_due: "destructive",
  canceled: "secondary",
};

function planPrice(plan: PlanSummary): string {
  const price = plan.prices?.TRY;
  if (!price) return "Contact sales";
  if (price.monthly === 0) return "Free";
  return `${formatMoney({ amount: price.monthly, currency: "TRY" })}/mo`;
}

function usageBar(used: number, max: number | null): string {
  if (max === null) return `${used} used`;
  return `${used} / ${max}`;
}

export function BillingManager({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const [subscription, setSubscription] = useState<SubscriptionDetail | null>(null);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [invoices, setInvoices] = useState<PlatformInvoiceSummary[]>([]);
  const [flags, setFlags] = useState<FeatureFlagSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);
  const changePlanAction = useSubmit();
  const cancelAction = useSubmit();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sub, planList, invoiceList, flagList] = await Promise.all([
        api<{ data: SubscriptionDetail }>(`/organizations/${organizationId}/billing/subscription`),
        api<{ data: PlanSummary[] }>("/billing/plans"),
        api<{ data: PlatformInvoiceSummary[] }>(`/organizations/${organizationId}/billing/invoices`),
        api<{ data: FeatureFlagSummary[] }>(`/organizations/${organizationId}/billing/feature-flags`),
      ]);
      setSubscription(sub.data);
      setPlans(planList.data);
      setInvoices(invoiceList.data);
      setFlags(flagList.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changePlan(planId: string) {
    const ok = await changePlanAction.run(() =>
      api(`/organizations/${organizationId}/billing/subscription`, { method: "POST", body: { planId } }),
    );
    if (ok !== undefined) await load();
  }

  async function cancel() {
    const ok = await cancelAction.run(() =>
      api(`/organizations/${organizationId}/billing/subscription/cancel`, { method: "POST" }),
    );
    if (ok !== undefined) {
      setCanceling(false);
      await load();
    }
  }

  async function toggleFlag(flag: FeatureFlagSummary) {
    const next = !flag.enabled;
    setFlags((prev) => prev.map((f) => (f.key === flag.key ? { ...f, enabled: next, overridden: true } : f)));
    try {
      await api(`/organizations/${organizationId}/billing/feature-flags/${flag.key}`, {
        method: "PATCH",
        body: { enabled: next },
      });
    } catch (err) {
      setFlags((prev) => prev.map((f) => (f.key === flag.key ? flag : f)));
      setError(errorMessage(err));
    }
  }

  if (loading) return <Skeleton className="h-64 w-full" />;
  if (error && !subscription) return <Alert variant="error">{error}</Alert>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">{organizationName}&apos;s plan, usage, and invoices.</p>
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {changePlanAction.error && <Alert variant="error">{changePlanAction.error}</Alert>}

      {subscription && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardDescription>Current plan</CardDescription>
              <CardTitle className="flex items-center gap-2 text-xl">
                {subscription.plan.name}
                <Badge variant={STATUS_VARIANT[subscription.status] ?? "secondary"}>
                  {subscription.status.replace(/_/g, " ")}
                </Badge>
              </CardTitle>
            </div>
            {subscription.status !== "canceled" && (
              <Button variant="ghost" size="sm" onClick={() => setCanceling(true)}>
                Cancel subscription
              </Button>
            )}
          </CardHeader>
          <CardContent className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-muted-foreground">
            {subscription.trialEndsAt && subscription.status === "trialing" && (
              <span>Trial ends {new Date(subscription.trialEndsAt).toLocaleDateString()}</span>
            )}
            <span>
              Stores: <span className="font-medium text-foreground">{usageBar(subscription.usage.storesUsed, subscription.usage.storesMax)}</span>
            </span>
            <span>
              Staff: <span className="font-medium text-foreground">{usageBar(subscription.usage.staffUsed, subscription.usage.staffMax)}</span>
            </span>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {plans.map((plan) => {
          // A canceled subscription still points at its old plan row, but it's no longer
          // "current" in any actionable sense — the button must stay clickable so the same
          // plan can be re-activated, not just a different one.
          const isCurrent = subscription?.plan.id === plan.id && subscription.status !== "canceled";
          return (
            <Card key={plan.id} className={isCurrent ? "border-primary" : undefined}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-2xl font-semibold tabular-nums">{planPrice(plan)}</p>
                <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {Object.entries(plan.entitlements).map(([key, value]) => (
                    <li key={key}>
                      {key}: <span className="font-medium text-foreground">{String(value)}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  size="sm"
                  variant={isCurrent ? "outline" : "primary"}
                  disabled={isCurrent}
                  loading={changePlanAction.pending}
                  onClick={() => void changePlan(plan.id)}
                >
                  {isCurrent ? "Current plan" : "Switch to this plan"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices yet.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {invoices.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between border-b py-1.5 last:border-0">
                  <span>{new Date(inv.createdAt).toLocaleDateString()}</span>
                  <span>{formatMoney(inv.amount)}</span>
                  <Badge variant={inv.status === "paid" ? "success" : inv.status === "void" ? "secondary" : "warning"}>
                    {inv.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Beta features</CardTitle>
          <CardDescription>Opt this organization into features still rolling out.</CardDescription>
        </CardHeader>
        <CardContent>
          {flags.length === 0 ? (
            <p className="text-sm text-muted-foreground">No feature flags available.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {flags.map((flag) => (
                <li key={flag.key} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{flag.key}</p>
                    {flag.description && <p className="text-xs text-muted-foreground">{flag.description}</p>}
                  </div>
                  <Checkbox checked={flag.enabled} onChange={() => void toggleFlag(flag)} aria-label={`Toggle ${flag.key}`} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={canceling}
        onClose={() => setCanceling(false)}
        title="Cancel subscription?"
        description="This takes effect immediately. You can pick a plan again any time."
        destructive
        pending={cancelAction.pending}
        onConfirm={cancel}
      />
    </div>
  );
}
