"use client";

import { Tabs } from "@ocean/ui";
import { useState } from "react";

import { TaxWarningsBanner } from "../../tax-warnings-banner";
import { TaxClassesManager } from "./tax-classes-manager";
import { TaxRegistrationsManager } from "./tax-registrations-manager";
import { TaxesManager } from "./taxes-manager";

type Tab = "rules" | "registrations" | "classes";

// Settings -> Taxes & Duties. "Rules" is the real Phase 7 rate engine (unchanged); this L3 pass
// adds "Registrations" (spec section 21) and "Classes" (spec section 24) as new tabs alongside
// it, without touching how rates are calculated at checkout.
export function TaxesShell({
  storeId,
  storeSlug,
  pricesIncludeTax,
  canWrite,
}: {
  storeId: string;
  storeSlug: string;
  pricesIncludeTax: boolean;
  canWrite: boolean;
}) {
  const [tab, setTab] = useState<Tab>("rules");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Taxes & duties</h1>
        <p className="text-sm text-muted-foreground">
          Rate rules, tax registrations and tax classes. Terminology follows each country&apos;s
          real tax system — never a hardcoded &quot;VAT&quot;.
        </p>
      </div>
      <TaxWarningsBanner storeId={storeId} storeSlug={storeSlug} />
      <Tabs
        aria-label="Tax settings sections"
        value={tab}
        onChange={setTab}
        items={[
          { value: "rules", label: "Rules" },
          { value: "registrations", label: "Registrations" },
          { value: "classes", label: "Classes" },
        ]}
      />
      {tab === "rules" && (
        <TaxesManager storeId={storeId} pricesIncludeTax={pricesIncludeTax} canWrite={canWrite} />
      )}
      {tab === "registrations" && (
        <TaxRegistrationsManager storeId={storeId} canWrite={canWrite} />
      )}
      {tab === "classes" && <TaxClassesManager storeId={storeId} canWrite={canWrite} />}
    </div>
  );
}
