import { Alert } from "@ocean/ui";
import { notFound } from "next/navigation";

import { canOrg, findStore, requireMe } from "@/lib/session";

import { BusinessProfileForm } from "./business-profile-form";

export const metadata = { title: "Business information · Ocean Admin" };

export default async function BusinessProfilePage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const me = await requireMe(`/${storeSlug}/settings/business`);
  const found = findStore(me, storeSlug);
  if (!found) notFound();
  const { organization } = found;

  if (!canOrg(organization, "organization.read")) {
    return (
      <Alert variant="warning" title="Business information is restricted">
        Your role ({organization.role.replace(/_/g, " ")}) cannot view business information for{" "}
        {organization.name}.
      </Alert>
    );
  }

  return (
    <BusinessProfileForm
      organizationId={organization.id}
      organizationName={organization.name}
      editable={canOrg(organization, "organization.write")}
    />
  );
}
