import "server-only";

import type { AccountManagerCandidate, CompanyDetail } from "@ocean/types";
import { notFound } from "next/navigation";

import { api, isApiError } from "@/lib/api";
import { cookieHeader } from "@/lib/session";

export async function loadCompany(storeId: string, companyId: string): Promise<CompanyDetail> {
  try {
    const res = await api<{ data: CompanyDetail }>(`/stores/${storeId}/companies/${companyId}`, {
      cookie: await cookieHeader(),
    });
    return res.data;
  } catch (err) {
    if (isApiError(err, "not_found")) notFound();
    throw err;
  }
}

export async function loadAccountManagers(storeId: string): Promise<AccountManagerCandidate[]> {
  const res = await api<{ data: AccountManagerCandidate[] }>(
    `/stores/${storeId}/companies/account-managers`,
    { cookie: await cookieHeader() },
  );
  return res.data;
}
