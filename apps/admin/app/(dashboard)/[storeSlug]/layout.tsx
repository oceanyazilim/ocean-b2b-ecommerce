import { Badge } from "@ocean/ui";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { type AppNavGroup, type AppNavLink, AppSidebar } from "@/components/app-sidebar";
import { CommandPalette, type PaletteNavItem, type PaletteSearchScope } from "@/components/command-palette";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { LanguageSwitcher } from "@/components/language-switcher";
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
  const t = await getTranslations("shell");
  const tSettings = await getTranslations("common");

  const base = `/${store.slug}`;
  const canContent = can(store, "content.read") && can(store, "settings.read");
  const canStorefront =
    can(store, "content.read") && !can(store, "settings.read") && !can(store, "themes.read");

  // Grouped information architecture for the main sidebar (AppSidebar) — mirrors the redesign
  // spec's IA (Orders / Products / Customers / B2B / Content / Sales / Analytics), but every
  // group here only contains entries that map to a real, working page in this codebase. Spec
  // entries with no backing route today (Segments, Purchase orders, Gift cards, POS,
  // Marketplaces, Social commerce, Metaobjects, Marketing, Discounts, Finance, Markets, Apps,
  // Automations as top-level areas) are intentionally omitted rather than stubbed out.
  // Labels come from the `shell` translation namespace (locales/{en,tr}/shell.json) — this is
  // the app shell, in scope for full Türkçe/English parity (see the i18n phase report).
  const home: AppNavLink = { label: t("sidebar.nav.home"), href: base, icon: "home" };
  const settingsItem: AppNavLink = {
    label: tSettings("settings"),
    href: `${base}/settings/general`,
    icon: "settings",
  };

  const groupDefs: { label: string; items: (AppNavLink & { allowed: boolean })[] }[] = [
    {
      label: t("sidebar.groups.orders"),
      items: [
        {
          label: t("sidebar.nav.allOrders"),
          href: `${base}/orders`,
          icon: "orders",
          allowed: can(store, "orders.read"),
        },
        {
          label: t("sidebar.nav.draftOrders"),
          href: `${base}/orders/drafts`,
          icon: "orders",
          allowed: can(store, "orders.read"),
        },
      ],
    },
    {
      label: t("sidebar.groups.products"),
      items: [
        {
          label: t("sidebar.nav.allProducts"),
          href: `${base}/products`,
          icon: "products",
          allowed: can(store, "products.read"),
        },
        {
          label: t("sidebar.nav.collections"),
          href: `${base}/collections`,
          icon: "collections",
          allowed: can(store, "collections.read"),
        },
        {
          label: t("sidebar.nav.inventory"),
          href: `${base}/inventory`,
          icon: "inventory",
          allowed: can(store, "inventory.read"),
        },
      ],
    },
    {
      label: t("sidebar.groups.customers"),
      items: [
        {
          label: t("sidebar.nav.customers"),
          href: `${base}/customers`,
          icon: "customers",
          allowed: can(store, "customers.read"),
        },
      ],
    },
    {
      label: t("sidebar.groups.b2b"),
      items: [
        {
          label: t("sidebar.nav.companies"),
          href: `${base}/companies`,
          icon: "companies",
          allowed: can(store, "companies.read"),
        },
        {
          label: t("sidebar.nav.catalogs"),
          href: `${base}/catalogs`,
          icon: "catalogs",
          allowed: can(store, "catalogs.read"),
        },
        {
          label: t("sidebar.nav.priceLists"),
          href: `${base}/pricing`,
          icon: "pricing",
          allowed: can(store, "pricing.read"),
        },
        {
          label: t("sidebar.nav.quotes"),
          href: `${base}/quotes`,
          icon: "quotes",
          allowed: can(store, "quotes.read"),
        },
      ],
    },
    {
      label: t("sidebar.groups.content"),
      items: [
        {
          label: t("sidebar.nav.pages"),
          href: `${base}/storefront/pages`,
          icon: "storefront",
          allowed: canContent,
        },
        {
          label: t("sidebar.nav.blog"),
          href: `${base}/storefront/blogs`,
          icon: "storefront",
          allowed: canContent,
        },
        {
          label: t("sidebar.nav.menus"),
          href: `${base}/storefront/menus`,
          icon: "storefront",
          allowed: canContent,
        },
      ],
    },
    {
      label: t("sidebar.groups.sales"),
      items: [
        {
          label: t("sidebar.nav.onlineStore"),
          href: `${base}/storefront`,
          icon: "storefront",
          allowed: canContent || canStorefront,
        },
      ],
    },
    {
      label: t("sidebar.groups.analytics"),
      items: [
        {
          label: t("sidebar.nav.analytics"),
          href: `${base}/analytics`,
          icon: "analytics",
          allowed: can(store, "analytics.read"),
        },
      ],
    },
  ];

  const groups: AppNavGroup[] = groupDefs
    .map((group) => ({
      label: group.label,
      items: group.items.filter((item) => item.allowed).map(({ allowed: _allowed, ...link }) => link),
    }))
    .filter((group) => group.items.length > 0);

  // Flat list used by the mobile fallback menu and by the "disabled" convention the plain
  // SidebarNav component already understands.
  const items: NavItem[] = [
    home,
    ...groups.flatMap((g) => g.items),
    { ...settingsItem, disabled: !can(store, "settings.read") },
  ];

  // The command palette's static "Go to" results — every enabled top-level section plus the
  // Settings sub-tabs, gated by the same permissions used to disable/hide them in the sidebar.
  // "Settings" itself is skipped here since it links straight to settings/general, which the
  // Settings sub-tab list below already includes — keeps the result list free of duplicates.
  const paletteNavItems: PaletteNavItem[] = [
    ...items
      .filter((item) => !item.disabled && item.href !== settingsItem.href)
      .map((item) => ({ label: item.label, href: item.href, group: t("commandPalette.navigationGroup") })),
    ...(
      [
        { label: t("settingsNav.general"), href: `${base}/settings/general`, allowed: can(store, "settings.read") },
        {
          label: t("settingsNav.usersPermissions"),
          href: `${base}/settings/team`,
          allowed: can(store, "users.manage"),
        },
        {
          label: t("settingsNav.billingPlan"),
          href: `${base}/settings/billing`,
          allowed: can(store, "settings.read"),
        },
        { label: t("settingsNav.api"), href: `${base}/settings/developer`, allowed: can(store, "apps.install") },
        { label: t("settingsNav.sso"), href: `${base}/settings/sso`, allowed: can(store, "settings.read") },
        {
          label: t("settingsNav.shipping"),
          href: `${base}/settings/shipping`,
          allowed: can(store, "shipping.read"),
        },
        { label: t("settingsNav.taxes"), href: `${base}/settings/taxes`, allowed: can(store, "taxes.read") },
        {
          label: t("settingsNav.payments"),
          href: `${base}/settings/payment-methods`,
          allowed: can(store, "payments.read"),
        },
        {
          label: t("settingsNav.customData"),
          href: `${base}/settings/metafields`,
          allowed: can(store, "settings.read"),
        },
        { label: t("settingsNav.files"), href: `${base}/settings/files`, allowed: can(store, "products.read") },
        {
          label: t("settingsNav.activityLog"),
          href: `${base}/settings/audit`,
          allowed: can(store, "settings.read"),
        },
        { label: t("settingsNav.adminLanguage"), href: "/account/language", allowed: true },
      ] as const
    )
      .filter((item) => item.allowed)
      .map((item) => ({ label: item.label, href: item.href, group: t("commandPalette.settingsGroup") })),
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
      {/* Mobile fallback: the collapsible/pinnable AppSidebar is a desktop-oriented rail, so
          small screens get a simple flat menu instead. */}
      <div className="flex w-full flex-col border-b bg-background lg:hidden">
        <div className="flex items-center justify-between gap-2 px-3 py-3">
          <StoreSwitcher stores={switcherStores} current={store.slug} />
        </div>
        <details className="px-2 pb-3">
          <summary className="cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium">
            {t("sidebar.mobileMenu")}
          </summary>
          <div className="pt-1">
            <SidebarNav items={items} />
          </div>
        </details>
      </div>

      <div className="hidden lg:flex">
        <AppSidebar
          storeId={store.id}
          orgName={organization.name}
          home={home}
          groups={groups}
          settingsItem={settingsItem}
          switcher={<StoreSwitcher stores={switcherStores} current={store.slug} />}
          user={{ name: me.user.name, initials, href: "/account/security" }}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <ImpersonationBanner storeId={store.id} />
        <header className="flex items-center justify-between gap-3 border-b bg-background px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-2">
            <Badge variant={store.status === "active" ? "success" : "secondary"}>{store.status}</Badge>
            {store.role && (
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {store.role.replace(/_/g, " ")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <CommandPalette
              storeId={store.id}
              storeSlug={store.slug}
              navItems={paletteNavItems}
              searchScope={paletteSearchScope}
            />
            <LanguageSwitcher />
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
