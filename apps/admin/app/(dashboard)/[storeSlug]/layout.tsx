import { Badge } from "@ocean/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { CommandPalette, type PaletteNavItem, type PaletteSearchScope } from "@/components/command-palette";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { LogoutButton } from "@/components/logout-button";
import { NotificationBell } from "@/components/notification-bell";
import { SidebarNav, type NavItem } from "@/components/sidebar-nav";
import { StoreSwitcher } from "@/components/store-switcher";
import { can, findStore, requireMe } from "@/lib/session";

export default async function StoreLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const me = await requireMe(`/${storeSlug}`);
  const found = findStore(me, storeSlug);
  if (!found) notFound();
  const { organization, store } = found;

  const base = `/${store.slug}`;
  const items: NavItem[] = [
    { label: "Home", href: base, icon: "home" },
    { label: "Orders", href: `${base}/orders`, icon: "orders", disabled: !can(store, "orders.read") },
    {
      label: "Products",
      href: `${base}/products`,
      icon: "products",
      disabled: !can(store, "products.read"),
    },
    {
      label: "Collections",
      href: `${base}/collections`,
      icon: "collections",
      disabled: !can(store, "collections.read"),
    },
    {
      label: "Inventory",
      href: `${base}/inventory`,
      icon: "inventory",
      disabled: !can(store, "inventory.read"),
    },
    {
      label: "Customers",
      href: `${base}/customers`,
      icon: "customers",
      disabled: !can(store, "customers.read"),
    },
    {
      label: "Companies",
      href: `${base}/companies`,
      icon: "companies",
      disabled: !can(store, "companies.read"),
    },
    {
      label: "Catalogs",
      href: `${base}/catalogs`,
      icon: "catalogs",
      disabled: !can(store, "catalogs.read"),
    },
    {
      label: "Pricing",
      href: `${base}/pricing`,
      icon: "pricing",
      disabled: !can(store, "pricing.read"),
    },
    { label: "Quotes", href: `${base}/quotes`, icon: "quotes", disabled: !can(store, "quotes.read") },
    {
      label: "Storefront",
      href: `${base}/storefront`,
      icon: "storefront",
      disabled: !can(store, "content.read") && !can(store, "settings.read") && !can(store, "themes.read"),
    },
    {
      label: "Analytics",
      href: `${base}/analytics`,
      icon: "analytics",
      disabled: !can(store, "analytics.read"),
    },
    {
      label: "Settings",
      href: `${base}/settings/general`,
      icon: "settings",
      disabled: !can(store, "settings.read"),
    },
  ];

  // The command palette's static "Go to" results — every enabled top-level section plus the
  // Settings sub-tabs, gated by the same permissions used to disable/hide them in the sidebar.
  // "Settings" itself is skipped here since it links straight to settings/general, which the
  // Settings sub-tab list below already includes — keeps the result list free of duplicates.
  const paletteNavItems: PaletteNavItem[] = [
    ...items
      .filter((item) => !item.disabled && item.label !== "Settings")
      .map((item) => ({ label: item.label, href: item.href, group: "Navigation" })),
    ...(
      [
        { label: "General", href: `${base}/settings/general`, allowed: can(store, "settings.read") },
        { label: "Team", href: `${base}/settings/team`, allowed: can(store, "users.manage") },
        { label: "Billing", href: `${base}/settings/billing`, allowed: can(store, "settings.read") },
        { label: "Developer", href: `${base}/settings/developer`, allowed: can(store, "apps.install") },
        { label: "SSO", href: `${base}/settings/sso`, allowed: can(store, "settings.read") },
        { label: "Shipping", href: `${base}/settings/shipping`, allowed: can(store, "shipping.read") },
        { label: "Taxes", href: `${base}/settings/taxes`, allowed: can(store, "taxes.read") },
        {
          label: "Payment methods",
          href: `${base}/settings/payment-methods`,
          allowed: can(store, "payments.read"),
        },
        { label: "Metafields", href: `${base}/settings/metafields`, allowed: can(store, "settings.read") },
        { label: "Files", href: `${base}/settings/files`, allowed: can(store, "products.read") },
        { label: "Audit log", href: `${base}/settings/audit`, allowed: can(store, "settings.read") },
      ] as const
    )
      .filter((item) => item.allowed)
      .map((item) => ({ label: item.label, href: item.href, group: "Settings" })),
  ];

  const paletteSearchScope: PaletteSearchScope = {
    products: can(store, "products.read"),
    orders: can(store, "orders.read"),
    customers: can(store, "customers.read"),
    companies: can(store, "companies.read"),
  };

  const switcherStores = me.organizations.flatMap((o) =>
    o.stores.map((s) => ({ slug: s.slug, name: s.name, organizationName: o.name })),
  );

  const initials = me.user.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-screen flex-col bg-canvas lg:flex-row">
      <aside className="flex w-full flex-col border-b bg-background lg:w-64 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            O
          </span>
          <Link href="/" className="text-sm font-semibold tracking-tight">
            Ocean
          </Link>
        </div>
        <div className="px-3 pb-3">
          <StoreSwitcher stores={switcherStores} current={store.slug} />
          <p className="mt-1 truncate px-1 text-xs text-muted-foreground">{organization.name}</p>
        </div>
        <div className="hidden flex-1 px-2 pb-4 lg:block">
          <SidebarNav items={items} />
        </div>
        <details className="px-2 pb-3 lg:hidden">
          <summary className="cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium">
            Menu
          </summary>
          <div className="pt-1">
            <SidebarNav items={items} />
          </div>
        </details>
        <div className="hidden border-t px-3 py-3 lg:block">
          <Link
            href="/account/security"
            className="flex items-center gap-2.5 rounded-md px-1 py-1.5 text-sm hover:bg-accent/60"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold">
              {initials || "U"}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">{me.user.name}</span>
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <ImpersonationBanner storeId={store.id} />
        <header className="flex items-center justify-between gap-4 border-b bg-background px-6 py-3">
          <div className="flex items-center gap-2">
            <Badge variant={store.status === "active" ? "success" : "secondary"}>
              {store.status}
            </Badge>
            {store.role && (
              <span className="text-xs text-muted-foreground">{store.role.replace(/_/g, " ")}</span>
            )}
          </div>
          <div className="flex flex-1 items-center justify-end gap-3 text-sm text-muted-foreground sm:justify-center">
            <CommandPalette
              storeId={store.id}
              storeSlug={store.slug}
              navItems={paletteNavItems}
              searchScope={paletteSearchScope}
            />
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <NotificationBell storeId={store.id} />
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
