import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { CompaniesList } from "./companies-list";

export const metadata = { title: "Companies · Ocean Admin" };

export default async function CompaniesPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/companies");
  if (!can(store, "companies.read")) {
    return <Alert variant="warning">Your role cannot view companies.</Alert>;
  }
  return (
    <CompaniesList
      storeId={store.id}
      storeSlug={store.slug}
      canWrite={can(store, "companies.write")}
    />
  );
}
