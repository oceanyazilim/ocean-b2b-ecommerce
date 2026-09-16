import type { MetafieldDefinitionSummary, MetafieldValue } from "@ocean/types";
import { Alert } from "@ocean/ui";

import { api } from "@/lib/api";
import { can, cookieHeader } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { CompanyForm } from "../company-form";
import { CompanyShell } from "../company-shell";
import { loadAccountManagers, loadCompany } from "../load-company";

export const metadata = { title: "Company · Ocean Admin" };

export default async function CompanyOverviewPage({
  params,
}: {
  params: Promise<{ storeSlug: string; companyId: string }>;
}) {
  const { storeSlug, companyId } = await params;
  const { store } = await loadStorePage(storeSlug, `/companies/${companyId}`);
  if (!can(store, "companies.read"))
    return <Alert variant="warning">Your role cannot view companies.</Alert>;

  const cookie = await cookieHeader();
  const [company, managers, definitions, metafields] = await Promise.all([
    loadCompany(store.id, companyId),
    loadAccountManagers(store.id),
    api<{ data: MetafieldDefinitionSummary[] }>(
      `/stores/${store.id}/metafield-definitions?ownerType=company`,
      { cookie },
    ),
    api<{ data: MetafieldValue[] }>(`/stores/${store.id}/companies/${companyId}/metafields`, {
      cookie,
    }),
  ]);

  return (
    <CompanyShell storeSlug={store.slug} company={company}>
      <CompanyForm
        storeId={store.id}
        storeSlug={store.slug}
        storeCurrency={store.defaultCurrency}
        company={company}
        managers={managers}
        definitions={definitions.data}
        metafields={metafields.data}
        readOnly={!can(store, "companies.write")}
      />
    </CompanyShell>
  );
}
