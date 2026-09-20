import type { PlatformCountrySummary } from "@ocean/types";

import { api } from "@/lib/api";
import { cookieHeader, requirePlatformOperator } from "@/lib/session";

import { CountriesClient } from "./countries-client";

export const metadata = { title: "Countries · Ocean Platform Admin" };

// Spec section 32: "Platform Admin -> Countries. This is NOT visible to normal merchants."
export default async function CountriesPage() {
  await requirePlatformOperator("/countries");
  const { data: countries } = await api<{ data: PlatformCountrySummary[] }>("/countries", {
    cookie: await cookieHeader(),
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Countries</h1>
        <p className="text-sm text-muted-foreground">
          The Global Country Engine catalog every localized surface (business onboarding, tax
          terminology, storefront locales, invoicing) reads from. Read-only here — country data
          is seeded, not edited through this screen.
        </p>
      </div>
      <CountriesClient countries={countries} />
    </div>
  );
}
