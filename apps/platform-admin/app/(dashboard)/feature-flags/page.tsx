import type { PlatformCountrySummary, PlatformFeatureFlagSummary } from "@ocean/types";

import { api } from "@/lib/api";
import { cookieHeader, requirePlatformOperator } from "@/lib/session";

import { FeatureFlagsClient } from "./feature-flags-client";

export const metadata = { title: "Feature flags · Ocean Platform Admin" };

export default async function FeatureFlagsPage() {
  await requirePlatformOperator("/feature-flags");
  const cookie = await cookieHeader();
  const [{ data: flags }, { data: countries }] = await Promise.all([
    api<{ data: PlatformFeatureFlagSummary[] }>("/feature-flags", { cookie }),
    api<{ data: PlatformCountrySummary[] }>("/countries", { cookie }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Feature flags</h1>
        <p className="text-sm text-muted-foreground">
          Global default-on/off toggles, plus per-organization, per-store and per-country
          overrides (spec section 33 — e.g. "Cash on delivery: available in Turkey, unavailable
          elsewhere").
        </p>
      </div>
      <FeatureFlagsClient initialFlags={flags} countries={countries} />
    </div>
  );
}
