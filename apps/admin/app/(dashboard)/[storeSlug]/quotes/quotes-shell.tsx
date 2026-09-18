import type { ReactNode } from "react";

import { SectionTabs } from "@/components/section-tabs";

export function QuotesShell({
  storeSlug,
  actions,
  children,
}: {
  storeSlug: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const base = `/${storeSlug}/quotes`;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Quotes</h1>
          <p className="text-sm text-muted-foreground">
            B2B negotiation, credit, approvals, invoicing, discounts, and quick order lists.
          </p>
        </div>
        {actions}
      </div>
      <SectionTabs
        ariaLabel="Quotes sections"
        items={[
          { label: "Quotes", href: base, exact: true },
          { label: "Credit accounts", href: `${base}/credit` },
          { label: "Approvals", href: `${base}/approvals` },
          { label: "Invoices", href: `${base}/invoices` },
          { label: "Discounts", href: `${base}/discounts` },
          { label: "Saved lists", href: `${base}/saved-lists` },
        ]}
      />
      {children}
    </div>
  );
}
