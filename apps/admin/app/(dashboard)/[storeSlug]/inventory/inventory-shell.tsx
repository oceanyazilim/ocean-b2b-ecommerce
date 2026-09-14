import type { ReactNode } from "react";

import { InventoryNav } from "./inventory-nav";

export function InventoryShell({
  storeSlug,
  actions,
  children,
}: {
  storeSlug: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-sm text-muted-foreground">
            Stock per location, every movement on a ledger, transfers between sites.
          </p>
        </div>
        {actions}
      </div>
      <InventoryNav storeSlug={storeSlug} />
      {children}
    </div>
  );
}
