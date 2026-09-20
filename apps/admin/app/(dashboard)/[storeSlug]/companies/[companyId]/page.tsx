import type {
  CreditAccountSummary,
  MetafieldDefinitionSummary,
  MetafieldValue,
  OrderSummary,
  Paginated,
} from "@ocean/types";
import { Alert } from "@ocean/ui";

import { api } from "@/lib/api";
import { can, cookieHeader } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { CompanyForm } from "../company-form";
import { CompanyShell } from "../company-shell";
import { loadAccountManagers, loadCompany } from "../load-company";

export const metadata = { title: "Company · Ocean Admin" };

const EMPTY_ORDERS_PAGE: Paginated<OrderSummary> = {
  data: [],
  pageInfo: { hasNextPage: false, endCursor: null },
};

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
  const canReadCredit = can(store, "credit.read");
  const canReadOrders = can(store, "orders.read");
  const [company, managers, definitions, metafields, creditAccounts, orders] = await Promise.all([
    loadCompany(store.id, companyId),
    loadAccountManagers(store.id),
    api<{ data: MetafieldDefinitionSummary[] }>(
      `/stores/${store.id}/metafield-definitions?ownerType=company`,
      { cookie },
    ),
    api<{ data: MetafieldValue[] }>(`/stores/${store.id}/companies/${companyId}/metafields`, {
      cookie,
    }),
    canReadCredit
      ? api<{ data: CreditAccountSummary[] }>(`/stores/${store.id}/credit-accounts`, { cookie })
      : Promise.resolve({ data: [] as CreditAccountSummary[] }),
    // Real spend aggregate, not a stored/cached figure: the credit and orders modules don't expose
    // a per-company totals endpoint, so lifetime value is computed here from the company's own
    // real orders (capped at 250 — the API's max page size — which comfortably covers a single
    // B2B account's history; if it's ever exceeded the figure is labelled "at least").
    canReadOrders
      ? api<Paginated<OrderSummary>>(
          `/stores/${store.id}/orders?companyId=${companyId}&limit=250&sort=created_desc`,
          { cookie },
        )
      : Promise.resolve(EMPTY_ORDERS_PAGE),
  ]);

  const companyCredit = creditAccounts.data.find((a) => a.companyId === companyId) ?? null;
  const locationIds = new Set(company.locations.map((l) => l.id));
  const locationCredit = creditAccounts.data.filter(
    (a) => a.companyLocationId && locationIds.has(a.companyLocationId),
  );

  const orderStats = canReadOrders
    ? {
        count: orders.data.length,
        lifetimeValue: {
          amount: orders.data.reduce((sum, o) => sum + o.total.amount, 0),
          currency: company.currency,
        },
        lastOrderAt: orders.data[0]?.createdAt ?? null,
        hasMore: orders.pageInfo.hasNextPage,
      }
    : null;

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
        companyCredit={companyCredit}
        locationCredit={locationCredit}
        canViewCredit={canReadCredit}
        orderStats={orderStats}
      />
    </CompanyShell>
  );
}
