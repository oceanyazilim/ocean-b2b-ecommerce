import type { MetafieldDefinitionSummary } from "@ocean/types";
import { Alert } from "@ocean/ui";

import { api } from "@/lib/api";
import { can, cookieHeader } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { MetafieldDefinitions } from "./metafield-definitions";

export const metadata = { title: "Metafields · Ocean Admin" };

export default async function MetafieldsPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/settings/metafields");
  if (!can(store, "settings.read"))
    return <Alert variant="warning">Your role cannot view settings.</Alert>;
  const definitions = await api<{ data: MetafieldDefinitionSummary[] }>(
    `/stores/${store.id}/metafield-definitions`,
    { cookie: await cookieHeader() },
  );
  return (
    <MetafieldDefinitions
      storeId={store.id}
      definitions={definitions.data}
      canWrite={can(store, "settings.write")}
    />
  );
}
