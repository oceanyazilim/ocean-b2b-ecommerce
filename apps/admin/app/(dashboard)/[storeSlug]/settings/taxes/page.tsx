import { Alert } from "@ocean/ui";

import { api } from "@/lib/api";
import { can, cookieHeader } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { TaxesShell } from "./taxes-shell";

export const metadata = { title: "Taxes · Ocean Admin" };

export default async function TaxesPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/settings/taxes");
  if (!can(store, "taxes.read"))
    return <Alert variant="warning">Your role cannot view tax settings.</Alert>;
  const settings = await api<{ data: { pricesIncludeTax: boolean } }>(
    `/stores/${store.id}/tax/settings`,
    { cookie: await cookieHeader() },
  );
  return (
    <TaxesShell
      storeId={store.id}
      storeSlug={store.slug}
      pricesIncludeTax={settings.data.pricesIncludeTax}
      canWrite={can(store, "taxes.write")}
    />
  );
}
