import { Badge } from "@ocean/ui";
import Link from "next/link";
import type { ReactNode } from "react";

import { LogoutButton } from "@/components/logout-button";
import { SidebarNav, type NavItem } from "@/components/sidebar-nav";
import { requirePlatformOperator } from "@/lib/session";

const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/overview" },
  { label: "Organizations", href: "/organizations" },
  { label: "Stores", href: "/stores" },
  { label: "Domains", href: "/domains" },
  { label: "Feature flags", href: "/feature-flags" },
  { label: "Audit log", href: "/audit" },
];

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const me = await requirePlatformOperator();

  return (
    <div className="flex min-h-screen flex-col bg-canvas lg:flex-row">
      <aside className="flex w-full flex-col border-b bg-background lg:w-64 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            O
          </span>
          <Link href="/overview" className="text-sm font-semibold tracking-tight">
            Platform Admin
          </Link>
        </div>
        <div className="hidden flex-1 px-2 pb-4 lg:block">
          <SidebarNav items={NAV_ITEMS} />
        </div>
        <details className="px-2 pb-3 lg:hidden">
          <summary className="cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium">
            Menu
          </summary>
          <div className="pt-1">
            <SidebarNav items={NAV_ITEMS} />
          </div>
        </details>
        <div className="hidden border-t px-3 py-3 lg:block">
          <div className="flex items-center gap-2.5 rounded-md px-1 py-1.5 text-sm">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold">
              {me.operator.name.slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate">
              <span className="block truncate font-medium">{me.operator.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{me.operator.email}</span>
            </span>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b bg-warning/10 px-6 py-2 text-center text-xs font-medium text-warning-foreground">
          Internal Ocean tooling — cross-tenant access. Every action here is audited.
        </div>
        <header className="flex items-center justify-between gap-4 border-b bg-background px-6 py-3">
          <Badge variant="outline">Platform operator</Badge>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <LogoutButton />
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
