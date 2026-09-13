import { redirect } from "next/navigation";

import { requireMe } from "@/lib/session";

import { OrganizationForm } from "./organization-form";

export const metadata = { title: "Create organization · Ocean Admin" };

export default async function OnboardingOrganizationPage() {
  const me = await requireMe("/onboarding/organization");
  const existing = me.organizations[0];
  if (existing) {
    redirect(
      existing.stores.length > 0
        ? `/${existing.stores[0]!.slug}`
        : `/onboarding/store?organization=${existing.id}`,
    );
  }
  return <OrganizationForm disabled={!me.user.emailVerified} />;
}
