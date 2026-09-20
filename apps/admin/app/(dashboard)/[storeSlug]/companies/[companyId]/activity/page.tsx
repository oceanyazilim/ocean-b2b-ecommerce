import type { CompanyUserSummary } from "@ocean/types";
import { Alert } from "@ocean/ui";

import { api } from "@/lib/api";
import { can, cookieHeader } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { CompanyShell } from "../../company-shell";
import { loadCompany } from "../../load-company";
import { CompanyActivity } from "./company-activity";

export const metadata = { title: "Company activity · Ocean Admin" };

export default async function CompanyActivityPage({
  params,
}: {
  params: Promise<{ storeSlug: string; companyId: string }>;
}) {
  const { storeSlug, companyId } = await params;
  const { store } = await loadStorePage(storeSlug, `/companies/${companyId}/activity`);
  if (!can(store, "companies.read"))
    return <Alert variant="warning">Your role cannot view companies.</Alert>;
  const cookie = await cookieHeader();
  const [company, users] = await Promise.all([
    loadCompany(store.id, companyId),
    api<{ data: CompanyUserSummary[] }>(`/stores/${store.id}/companies/${companyId}/users`, {
      cookie,
    }),
  ]);
  return (
    <CompanyShell storeSlug={store.slug} company={company}>
      <CompanyActivity company={company} users={users.data} />
    </CompanyShell>
  );
}
