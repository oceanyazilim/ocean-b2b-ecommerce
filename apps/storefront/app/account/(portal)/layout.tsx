import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AccountSidebar } from "@/components/account-sidebar";
import { getAccountProfile } from "@/lib/account";
import { getContext } from "@/lib/storefront";

// Every page under /account/(portal)/* requires a signed-in customer — /account/login and
// /account/signup live outside this route group (same URL prefix, no group segment in the
// path) specifically so they never get wrapped by this redirect or the sidebar.
export default async function AccountPortalLayout({ children }: { children: ReactNode }) {
  const context = await getContext();
  if (!context.signedIn) redirect("/account/login");

  const profile = await getAccountProfile();
  const membership = profile.companies[0] ?? null;
  // Only a company_admin may manage teammates; invoices are visible to company_admin and
  // finance roles — the same COMPANY_ROLE_PERMISSIONS grants the API enforces server-side
  // (this only decides which links show, never what the API will actually allow).
  const showTeamNav = membership?.role === "company_admin";
  const showInvoicesNav = membership?.role === "company_admin" || membership?.role === "finance";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10 md:flex-row">
      <AccountSidebar
        customerName={profile.displayName}
        companyName={membership?.companyName ?? null}
        showCompanyNav={!!membership}
        showTeamNav={showTeamNav}
        showInvoicesNav={showInvoicesNav}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
