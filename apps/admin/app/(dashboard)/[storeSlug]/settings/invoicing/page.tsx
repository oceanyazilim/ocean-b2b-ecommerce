import type { EInvoiceConnectionSummary, InvoiceSettingsSummary } from "@ocean/types";
import { Alert } from "@ocean/ui";

import { api } from "@/lib/api";
import { can, cookieHeader } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { InvoicingShell } from "./invoicing-shell";

export const metadata = { title: "Invoicing · Ocean Admin" };

export default async function InvoicingSettingsPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/settings/invoicing");
  if (!can(store, "finance.read"))
    return <Alert variant="warning">Your role cannot view invoicing settings.</Alert>;

  const cookie = await cookieHeader();
  const [settings, connections] = await Promise.all([
    api<{ data: InvoiceSettingsSummary }>(`/stores/${store.id}/invoicing/settings`, { cookie }),
    api<{ data: EInvoiceConnectionSummary[] }>(`/stores/${store.id}/invoicing/connections`, { cookie }),
  ]);

  return (
    <InvoicingShell
      storeId={store.id}
      initialSettings={settings.data}
      initialConnections={connections.data}
      canWrite={can(store, "finance.write")}
    />
  );
}
