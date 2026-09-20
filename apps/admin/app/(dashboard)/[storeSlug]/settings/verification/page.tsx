import { Alert } from "@ocean/ui";
import { notFound } from "next/navigation";

import { canOrg, findStore, requireMe } from "@/lib/session";

import { BusinessVerificationPanel } from "./business-verification-panel";

export const metadata = { title: "Business verification · Ocean Admin" };

export default async function BusinessVerificationPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const me = await requireMe(`/${storeSlug}/settings/verification`);
  const found = findStore(me, storeSlug);
  if (!found) notFound();
  const { organization } = found;

  if (!canOrg(organization, "organization.read")) {
    return (
      <Alert variant="warning" title="Business verification is restricted">
        Your role ({organization.role.replace(/_/g, " ")}) cannot view business verification for{" "}
        {organization.name}.
      </Alert>
    );
  }

  return <BusinessVerificationPanel organizationId={organization.id} storeSlug={storeSlug} />;
}
