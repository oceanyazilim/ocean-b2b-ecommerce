"use client";

import type { TaxMarketWarning } from "@ocean/types";
import { Alert } from "@ocean/ui";
import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";

// Spec section 52: "If the merchant enters a market without configured taxation... Do NOT
// silently assume zero tax." Computed from real order/Market data server-side (TaxService.
// getMarketWarnings) — this component just renders whatever the API says is still unconfigured.
// No client-side dismissal: it re-fetches (and so re-appears) every time the Dashboard or Taxes
// settings page loads, for as long as the market really has no TaxRule/TaxRegistration.
export function TaxWarningsBanner({ storeId, storeSlug }: { storeId: string; storeSlug: string }) {
  const [warnings, setWarnings] = useState<TaxMarketWarning[]>([]);

  useEffect(() => {
    let cancelled = false;
    api<{ data: TaxMarketWarning[] }>(`/stores/${storeId}/tax/warnings`)
      .then((res) => {
        if (!cancelled) setWarnings(res.data);
      })
      .catch(() => {
        // No permission, or the check itself failed — fail quiet, same as other optional
        // dashboard widgets in this app.
      });
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  if (warnings.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {warnings.map((w) => (
        <Alert key={w.countryCode} variant="warning" title="Tax setup required">
          You are selling to customers in {w.countryName}, but no tax configuration has been
          completed for this market.{" "}
          <Link href={`/${storeSlug}/settings/taxes`} className="font-medium underline underline-offset-2">
            Review tax settings
          </Link>
        </Alert>
      ))}
    </div>
  );
}
