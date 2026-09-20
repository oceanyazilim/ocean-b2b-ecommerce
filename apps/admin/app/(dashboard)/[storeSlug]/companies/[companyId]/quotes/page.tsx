import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { CompanyShell } from "../../company-shell";
import { loadCompany } from "../../load-company";
import { CompanyQuotes } from "./company-quotes";

export const metadata = { title: "Company quotes · Ocean Admin" };

export default async function CompanyQuotesPage({
  params,
}: {
  params: Promise<{ storeSlug: string; companyId: string }>;
}) {
  const { storeSlug, companyId } = await params;
  const { store } = await loadStorePage(storeSlug, `/companies/${companyId}/quotes`);
  if (!can(store, "companies.read"))
    return <Alert variant="warning">Your role cannot view companies.</Alert>;
  const company = await loadCompany(store.id, companyId);
  return (
    <CompanyShell storeSlug={store.slug} company={company}>
      {can(store, "quotes.read") ? (
        <CompanyQuotes storeId={store.id} storeSlug={store.slug} companyId={company.id} />
      ) : (
        <Alert variant="warning">Your role cannot view quotes.</Alert>
      )}
    </CompanyShell>
  );
}
