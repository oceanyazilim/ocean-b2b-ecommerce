import type { PlatformFeatureFlagSummary } from "@ocean/types";

import { api } from "@/lib/api";
import { cookieHeader, requirePlatformOperator } from "@/lib/session";

import { FeatureFlagsClient } from "./feature-flags-client";

export const metadata = { title: "Feature flags · Ocean Platform Admin" };

export default async function FeatureFlagsPage() {
  await requirePlatformOperator("/feature-flags");
  const { data: flags } = await api<{ data: PlatformFeatureFlagSummary[] }>("/feature-flags", {
    cookie: await cookieHeader(),
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Feature flags</h1>
        <p className="text-sm text-muted-foreground">
          Global default-on/off toggles, plus per-organization and per-store overrides.
        </p>
      </div>
      <FeatureFlagsClient initialFlags={flags} />
    </div>
  );
}
