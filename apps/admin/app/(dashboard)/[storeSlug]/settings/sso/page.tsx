import { Alert } from "@ocean/ui";
import { notFound } from "next/navigation";

import { canOrg, findStore, requireMe } from "@/lib/session";

import { SsoManager } from "./sso-manager";

export const metadata = { title: "SSO · Ocean Admin" };

export default async function SsoPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const me = await requireMe(`/${storeSlug}/settings/sso`);
  const found = findStore(me, storeSlug);
  if (!found) notFound();
  const { organization } = found;

  if (!canOrg(organization, "organization.write")) {
    return (
      <Alert variant="warning" title="SSO is restricted">
        Your role ({organization.role.replace(/_/g, " ")}) cannot configure single sign-on for{" "}
        {organization.name}. Ask an organization owner or admin.
      </Alert>
    );
  }

  return <SsoManager organizationId={organization.id} />;
}
