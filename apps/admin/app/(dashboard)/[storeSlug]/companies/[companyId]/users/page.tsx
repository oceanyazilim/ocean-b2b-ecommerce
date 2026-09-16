import type { CompanyUserSummary } from "@ocean/types";
import { Alert } from "@ocean/ui";

import { api } from "@/lib/api";
import { can, cookieHeader } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { CompanyShell } from "../../company-shell";
import { loadCompany } from "../../load-company";
import { CompanyUsers } from "./company-users";

export const metadata = { title: "Company users · Ocean Admin" };

export default async function CompanyUsersPage({
  params,
}: {
  params: Promise<{ storeSlug: string; companyId: string }>;
}) {
  const { storeSlug, companyId } = await params;
  const { store } = await loadStorePage(storeSlug, `/companies/${companyId}/users`);
  if (!can(store, "companies.read"))
    return <Alert variant="warning">Your role cannot view companies.</Alert>;
  const [company, users] = await Promise.all([
    loadCompany(store.id, companyId),
    api<{ data: CompanyUserSummary[] }>(`/stores/${store.id}/companies/${companyId}/users`, {
      cookie: await cookieHeader(),
    }),
  ]);
  return (
    <CompanyShell storeSlug={store.slug} company={company}>
      <CompanyUsers
        storeId={store.id}
        storeSlug={store.slug}
        company={company}
        users={users.data}
        canWrite={can(store, "companies.write")}
      />
    </CompanyShell>
  );
}
