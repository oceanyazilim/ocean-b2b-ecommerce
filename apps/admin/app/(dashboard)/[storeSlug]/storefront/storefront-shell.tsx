import type { ReactNode } from "react";

import { SectionTabs } from "@/components/section-tabs";

export function StorefrontShell({
  storeSlug,
  actions,
  children,
}: {
  storeSlug: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const base = `/${storeSlug}/storefront`;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Storefront</h1>
          <p className="text-sm text-muted-foreground">
            Markets, domains, and content that shape what buyers see on the storefront.
          </p>
        </div>
        {actions}
      </div>
      <SectionTabs
        ariaLabel="Storefront sections"
        items={[
          { label: "Markets", href: base, exact: true },
          { label: "Domains", href: `${base}/domains` },
          { label: "Pages", href: `${base}/pages` },
          { label: "Legal", href: `${base}/legal` },
          { label: "Blogs", href: `${base}/blogs` },
          { label: "Menus", href: `${base}/menus` },
          { label: "Themes", href: `${base}/themes` },
          { label: "Languages", href: `${base}/languages` },
          { label: "Translations", href: `${base}/translations` },
          { label: "Consent", href: `${base}/consent` },
        ]}
      />
      {children}
    </div>
  );
}
