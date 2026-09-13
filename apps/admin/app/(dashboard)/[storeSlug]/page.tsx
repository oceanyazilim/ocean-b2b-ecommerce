import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ocean/ui";
import { notFound } from "next/navigation";

import { can, findStore, requireMe } from "@/lib/session";

import { OnboardingChecklist } from "./onboarding-checklist";

const METRICS = [
  { label: "Gross sales", value: "—" },
  { label: "Orders", value: "—" },
  { label: "Average order value", value: "—" },
  { label: "Outstanding receivables", value: "—" },
];

export default async function StoreHomePage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const me = await requireMe(`/${storeSlug}`);
  const found = findStore(me, storeSlug);
  if (!found) notFound();
  const { store } = found;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{store.name}</h1>
        <p className="text-sm text-muted-foreground">
          Welcome back, {me.user.name.split(" ")[0]}. Here is where your store stands today.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {METRICS.map((m) => (
          <Card key={m.label}>
            <CardHeader className="pb-2">
              <CardDescription>{m.label}</CardDescription>
              <CardTitle className="text-2xl">{m.value}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Available once orders start flowing (Phase 6).
            </CardContent>
          </Card>
        ))}
      </div>

      <OnboardingChecklist
        storeId={store.id}
        storeSlug={store.slug}
        state={store.onboardingState}
        editable={can(store, "settings.write")}
      />
    </div>
  );
}
