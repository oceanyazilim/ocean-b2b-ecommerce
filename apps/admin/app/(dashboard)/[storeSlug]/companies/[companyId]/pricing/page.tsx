import type { CompanyPricingOverview } from "@ocean/types";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ocean/ui";
import Link from "next/link";

import { api } from "@/lib/api";
import { can, cookieHeader } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { ContractPrices } from "../../../pricing/contracts/contract-prices";
import { CompanyShell } from "../../company-shell";
import { loadCompany } from "../../load-company";

export const metadata = { title: "Company pricing · Ocean Admin" };

export default async function CompanyPricingPage({
  params,
}: {
  params: Promise<{ storeSlug: string; companyId: string }>;
}) {
  const { storeSlug, companyId } = await params;
  const { store } = await loadStorePage(storeSlug, `/companies/${companyId}/pricing`);
  if (!can(store, "companies.read"))
    return <Alert variant="warning">Your role cannot view companies.</Alert>;
  const company = await loadCompany(store.id, companyId);
  if (!can(store, "pricing.read")) {
    return (
      <CompanyShell storeSlug={store.slug} company={company}>
        <Alert variant="warning">Your role cannot view pricing.</Alert>
      </CompanyShell>
    );
  }
  const overview = (
    await api<{ data: CompanyPricingOverview }>(
      `/stores/${store.id}/pricing/companies/${companyId}`,
      {
        cookie: await cookieHeader(),
      },
    )
  ).data;
  const base = `/${store.slug}`;
  return (
    <CompanyShell storeSlug={store.slug} company={company}>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Catalogs</CardTitle>
            <CardDescription>
              {overview.catalogs.length === 0
                ? "No catalog assigned: buyers see the full public assortment."
                : "Buyers see the union of the active catalogs below."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col divide-y text-sm">
            {overview.catalogs.map((c) => (
              <div
                key={`${c.id}-${c.locationName ?? ""}`}
                className="flex items-center justify-between gap-2 py-2"
              >
                <Link href={`${base}/catalogs/${c.id}`} className="font-medium hover:underline">
                  {c.name}
                </Link>
                <div className="flex gap-1">
                  <Badge variant={c.status === "active" ? "success" : "secondary"}>
                    {c.status}
                  </Badge>
                  <Badge variant="outline">
                    {c.via === "company" ? "All locations" : c.locationName}
                  </Badge>
                </div>
              </div>
            ))}
            <Link
              href={`${base}/catalogs`}
              className="pt-2 text-xs text-muted-foreground hover:underline"
            >
              Manage catalogs →
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Price lists</CardTitle>
            <CardDescription>
              The highest-priority active list applies to each buyer.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col divide-y text-sm">
            {overview.priceLists.length === 0 && (
              <p className="py-2 text-muted-foreground">
                No price list assigned: base prices apply.
              </p>
            )}
            {overview.priceLists.map((p) => (
              <div
                key={`${p.id}-${p.locationName ?? ""}`}
                className="flex items-center justify-between gap-2 py-2"
              >
                <Link
                  href={`${base}/pricing/price-lists/${p.id}`}
                  className="font-medium hover:underline"
                >
                  {p.name}
                </Link>
                <div className="flex gap-1">
                  <Badge variant={p.status === "active" ? "success" : "secondary"}>
                    {p.status}
                  </Badge>
                  <Badge variant="outline">priority {p.priority}</Badge>
                  <Badge variant="outline">
                    {p.via === "company" ? "All locations" : p.locationName}
                  </Badge>
                </div>
              </div>
            ))}
            <Link
              href={`${base}/pricing`}
              className="pt-2 text-xs text-muted-foreground hover:underline"
            >
              Manage price lists →
            </Link>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Contract prices</CardTitle>
          <CardDescription>Negotiated unit prices for this company.</CardDescription>
        </CardHeader>
        <CardContent>
          <ContractPrices
            storeId={store.id}
            storeSlug={store.slug}
            companyId={companyId}
            canWrite={can(store, "pricing.write")}
          />
        </CardContent>
      </Card>
    </CompanyShell>
  );
}
