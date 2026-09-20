import type { ReactNode } from "react";

import { SidebarNav } from "@/components/sidebar-nav";

// Settings IA (Phase 6). Grouped to mirror the master spec's structure — General/Store details,
// Plan/Billing, Users & permissions, Payments, Shipping & delivery, Taxes, Custom data, Files,
// API, Security, Activity log — but every entry below maps to a real, working sub-page. Spec
// items with no real dedicated page in this codebase (Checkout, Customer accounts, Markets,
// Domains, Notifications as distinct settings areas) are intentionally left out rather than
// stubbed; see the Phase 6 commit message for what was checked and where, if anywhere, that
// configuration actually lives today.
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
      <div className="lg:w-60">
        <h1 className="mb-3 px-1 text-lg font-semibold tracking-tight">Settings</h1>
        <div className="rounded-lg border bg-background p-2 shadow-card">
          <SidebarNav
            groups={[
              {
                heading: "Store",
                items: [
                  { label: "General", href: `${base}/general`, icon: "settings" },
                  { label: "Billing & plan", href: `${base}/billing`, icon: "billing" },
                ],
              },
              {
                heading: "Team",
                items: [
                  { label: "Users & permissions", href: `${base}/team`, icon: "users" },
                  { label: "Activity log", href: `${base}/audit`, icon: "activity" },
                ],
              },
              {
                heading: "Payments & fulfillment",
                items: [
                  { label: "Payments", href: `${base}/payment-methods`, icon: "payments" },
                  { label: "Shipping & delivery", href: `${base}/shipping`, icon: "shipping" },
                  { label: "Taxes", href: `${base}/taxes`, icon: "taxes" },
                ],
              },
              {
                heading: "Data",
                items: [
                  { label: "Custom data", href: `${base}/metafields`, icon: "data" },
                  { label: "Files", href: `${base}/files`, icon: "files" },
                ],
              },
              {
                heading: "Security & access",
                items: [
                  { label: "Single sign-on", href: `${base}/sso`, icon: "security" },
                  { label: "API", href: `${base}/developer`, icon: "developer" },
                  {
                    label: "Account security",
                    href: "/account/security",
                    icon: "security",
                    exactMatch: true,
                  },
                  {
                    label: "Admin language",
                    href: "/account/language",
                    icon: "language",
                    exactMatch: true,
                  },
                ],
              },
            ]}
          />
        </div>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
