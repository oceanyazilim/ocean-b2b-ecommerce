import type { MetafieldDefinitionSummary } from "@ocean/types";
import { Alert } from "@ocean/ui";

import { api } from "@/lib/api";
import { can, cookieHeader } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { CompanyForm } from "../company-form";
import { loadAccountManagers } from "../load-company";

export const metadata = { title: "New company · Ocean Admin" };

export default async function NewCompanyPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/companies/new");
  if (!can(store, "companies.write"))
    return <Alert variant="warning">Your role cannot create companies.</Alert>;
  const [managers, definitions] = await Promise.all([
    loadAccountManagers(store.id),
    api<{ data: MetafieldDefinitionSummary[] }>(
      `/stores/${store.id}/metafield-definitions?ownerType=company`,
      { cookie: await cookieHeader() },
    ),
  ]);
  return (
    <CompanyForm
      storeId={store.id}
      storeSlug={store.slug}
      storeCurrency={store.defaultCurrency}
      company={null}
      managers={managers}
      definitions={definitions.data}
      metafields={[]}
    />
  );
}
