import type { ReactNode } from "react";

import { SidebarNav } from "@/components/sidebar-nav";

export default async function SettingsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const base = `/${storeSlug}/settings`;
  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="lg:w-48">
        <h1 className="mb-3 px-3 text-lg font-semibold tracking-tight">Settings</h1>
        <SidebarNav
          items={[
            { label: "General", href: `${base}/general` },
            { label: "Team", href: `${base}/team` },
            { label: "Billing", href: `${base}/billing` },
            { label: "Developer", href: `${base}/developer` },
            { label: "Shipping", href: `${base}/shipping` },
            { label: "Taxes", href: `${base}/taxes` },
            { label: "Payment methods", href: `${base}/payment-methods` },
            { label: "Metafields", href: `${base}/metafields` },
            { label: "Files", href: `${base}/files` },
            { label: "Audit log", href: `${base}/audit` },
          ]}
        />
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
