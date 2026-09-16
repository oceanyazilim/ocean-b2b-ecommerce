import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { loadAccountManagers } from "../load-company";
import { ApplicationsBoard } from "./applications-board";

export const metadata = { title: "Company applications · Ocean Admin" };

export default async function CompanyApplicationsPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/companies/applications");
  if (!can(store, "companies.read"))
    return <Alert variant="warning">Your role cannot view companies.</Alert>;
  const managers = await loadAccountManagers(store.id);
  return (
    <ApplicationsBoard
      storeId={store.id}
      storeSlug={store.slug}
      managers={managers}
      canWrite={can(store, "companies.write")}
    />
  );
}
