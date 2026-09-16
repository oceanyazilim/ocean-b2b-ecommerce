import type { ReactNode } from "react";

import { SectionTabs } from "@/components/section-tabs";

export function PricingShell({
  storeSlug,
  actions,
  children,
}: {
  storeSlug: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const base = `/${storeSlug}/pricing`;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pricing</h1>
          <p className="text-sm text-muted-foreground">
            Contract price → price list → volume tier → base price. Every checkout recomputes from
            these rules.
          </p>
        </div>
        {actions}
      </div>
      <SectionTabs
        ariaLabel="Pricing sections"
        items={[
          { label: "Price lists", href: base, exact: true },
          { label: "Volume pricing", href: `${base}/volume` },
          { label: "Quantity rules", href: `${base}/quantity` },
          { label: "Contract prices", href: `${base}/contracts` },
          { label: "Simulator", href: `${base}/simulator` },
        ]}
      />
      {children}
    </div>
  );
}
