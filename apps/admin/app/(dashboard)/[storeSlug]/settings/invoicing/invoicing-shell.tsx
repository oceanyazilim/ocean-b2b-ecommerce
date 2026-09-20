"use client";

import type { EInvoiceConnectionSummary, InvoiceSettingsSummary } from "@ocean/types";
import { Tabs } from "@ocean/ui";
import { useState } from "react";

import { EInvoiceConnectionsManager } from "./einvoice-connections-manager";
import { InvoiceSettingsForm } from "./invoice-settings-form";

type Tab = "settings" | "einvoicing";

// Finance -> Invoicing (spec sections 28/29). "Settings" is the real, persisted configuration
// layer (prefix/numbering/legal name/tax id/address/bank info/footer notices/currency/language)
// invoice generation reads from; "E-invoicing" is the provider-connection status surface — a
// real config surface, never a live integration. See both tabs' components for the honesty
// boundary notes.
export function InvoicingShell({
  storeId,
  initialSettings,
  initialConnections,
  canWrite,
}: {
  storeId: string;
  initialSettings: InvoiceSettingsSummary;
  initialConnections: EInvoiceConnectionSummary[];
  canWrite: boolean;
}) {
  const [tab, setTab] = useState<Tab>("settings");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invoicing</h1>
        <p className="text-sm text-muted-foreground">
          How invoices from this store are numbered and headed, plus the status of any
          e-invoicing provider connections.
        </p>
      </div>
      <Tabs
        aria-label="Invoicing settings sections"
        value={tab}
        onChange={setTab}
        items={[
          { value: "settings", label: "Settings" },
          { value: "einvoicing", label: "E-invoicing" },
        ]}
      />
      {tab === "settings" && (
        <InvoiceSettingsForm storeId={storeId} initial={initialSettings} canWrite={canWrite} />
      )}
      {tab === "einvoicing" && (
        <EInvoiceConnectionsManager storeId={storeId} initial={initialConnections} canWrite={canWrite} />
      )}
    </div>
  );
}
