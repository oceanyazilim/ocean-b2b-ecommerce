import { redirect } from "next/navigation";

import { requireMe } from "@/lib/session";

import { StoreForm } from "./store-form";

export const metadata = { title: "Create store · Ocean Admin" };

export default async function OnboardingStorePage({
  searchParams,
}: {
  searchParams: Promise<{ organization?: string }>;
}) {
  const me = await requireMe("/onboarding/store");
  const { organization: requested } = await searchParams;
  const organization =
    me.organizations.find((o) => o.id === requested) ?? me.organizations[0] ?? null;
  if (!organization) redirect("/onboarding/organization");

  const canCreate = organization.permissions.includes("stores.create");
  return (
    <StoreForm
      organizationId={organization.id}
      organizationName={organization.name}
      canCreate={canCreate}
    />
  );
}
