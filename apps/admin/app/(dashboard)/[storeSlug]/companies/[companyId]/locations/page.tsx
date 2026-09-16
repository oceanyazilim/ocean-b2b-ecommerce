import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { CompanyShell } from "../../company-shell";
import { loadCompany } from "../../load-company";
import { CompanyLocations } from "./company-locations";

export const metadata = { title: "Company locations · Ocean Admin" };

export default async function CompanyLocationsPage({
  params,
}: {
  params: Promise<{ storeSlug: string; companyId: string }>;
}) {
  const { storeSlug, companyId } = await params;
  const { store } = await loadStorePage(storeSlug, `/companies/${companyId}/locations`);
  if (!can(store, "companies.read"))
    return <Alert variant="warning">Your role cannot view companies.</Alert>;
  const company = await loadCompany(store.id, companyId);
  return (
    <CompanyShell storeSlug={store.slug} company={company}>
      <CompanyLocations
        storeId={store.id}
        company={company}
        canWrite={can(store, "companies.write")}
      />
    </CompanyShell>
  );
}
