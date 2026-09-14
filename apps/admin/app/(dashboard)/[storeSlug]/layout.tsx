import { Badge } from "@ocean/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { LogoutButton } from "@/components/logout-button";
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
    { label: "Home", href: base },
    { label: "Orders", href: `${base}/orders`, disabled: true },
    { label: "Products", href: `${base}/products`, disabled: !can(store, "products.read") },
    {
      label: "Collections",
      href: `${base}/collections`,
      disabled: !can(store, "collections.read"),
    },
    { label: "Inventory", href: `${base}/inventory`, disabled: !can(store, "inventory.read") },
    { label: "Customers", href: `${base}/customers`, disabled: true },
    { label: "Companies", href: `${base}/companies`, disabled: true },
    { label: "Catalogs", href: `${base}/catalogs`, disabled: true },
    { label: "Pricing", href: `${base}/pricing`, disabled: true },
    { label: "Quotes", href: `${base}/quotes`, disabled: true },
    { label: "Storefront", href: `${base}/storefront`, disabled: true },
    { label: "Analytics", href: `${base}/analytics`, disabled: true },
    { label: "Settings", href: `${base}/settings/general`, disabled: !can(store, "settings.read") },
  ];

  const switcherStores = me.organizations.flatMap((o) =>
    o.stores.map((s) => ({ slug: s.slug, name: s.name, organizationName: o.name })),
  );

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="flex w-full flex-col border-b bg-muted/30 lg:w-60 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="inline-block h-6 w-6 rounded-md bg-primary" aria-hidden />
          <Link href="/" className="text-sm font-semibold tracking-tight">
            Ocean
          </Link>
        </div>
        <div className="px-3 pb-3">
          <StoreSwitcher stores={switcherStores} current={store.slug} />
          <p className="mt-1 truncate px-1 text-xs text-muted-foreground">{organization.name}</p>
        </div>
        <div className="hidden px-2 pb-4 lg:block">
          <SidebarNav items={items} />
        </div>
        <details className="px-2 pb-3 lg:hidden">
          <summary className="cursor-pointer px-3 py-1.5 text-sm font-medium">Menu</summary>
          <div className="pt-1">
            <SidebarNav items={items} />
          </div>
        </details>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b px-6 py-3">
          <div className="flex items-center gap-2">
            <Badge variant={store.status === "active" ? "success" : "secondary"}>
              {store.status}
            </Badge>
            {store.role && (
              <span className="text-xs text-muted-foreground">{store.role.replace(/_/g, " ")}</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Link href="/account/security" className="hidden hover:underline sm:inline">
              {me.user.name}
            </Link>
            <LogoutButton />
          </div>
        </header>
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
