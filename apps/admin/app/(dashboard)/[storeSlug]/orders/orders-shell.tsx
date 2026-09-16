import type { ReactNode } from "react";

import { SectionTabs } from "@/components/section-tabs";

export function OrdersShell({
  storeSlug,
  actions,
  children,
}: {
  storeSlug: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const base = `/${storeSlug}/orders`;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
          <p className="text-sm text-muted-foreground">
            Every order is priced server-side from the buyer&apos;s catalog, price list and contract
            prices. Stock is reserved the moment it is placed.
          </p>
        </div>
        {actions}
      </div>
      <SectionTabs
        ariaLabel="Order sections"
        items={[
          { label: "Orders", href: base, exact: true },
          { label: "Draft orders", href: `${base}/drafts` },
        ]}
      />
      {children}
    </div>
  );
}
