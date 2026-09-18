import { Alert } from "@ocean/ui";
import { notFound } from "next/navigation";

import { canOrg, findStore, requireMe } from "@/lib/session";

import { BillingManager } from "./billing-manager";

export const metadata = { title: "Billing · Ocean Admin" };

export default async function BillingPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const me = await requireMe(`/${storeSlug}/settings/billing`);
  const found = findStore(me, storeSlug);
  if (!found) notFound();
  const { organization } = found;

  if (!canOrg(organization, "organization.billing")) {
    return (
      <Alert variant="warning" title="Billing is restricted">
        Your role ({organization.role.replace(/_/g, " ")}) cannot view or manage billing for{" "}
        {organization.name}. Ask an organization owner or the billing role.
      </Alert>
    );
  }

  return <BillingManager organizationId={organization.id} organizationName={organization.name} />;
}
