"use client";

import {
  AnalyticsIcon,
  CatalogsIcon,
  CollectionsIcon,
  CompaniesIcon,
  CreditCardIcon,
  CustomersIcon,
  DatabaseIcon,
  FolderIcon,
  HistoryIcon,
  HomeIcon,
  type IconProps,
  InventoryIcon,
  KeyIcon,
  LanguagesIcon,
  OrdersIcon,
  PercentIcon,
  PricingIcon,
  ProductsIcon,
  QuotesIcon,
  SettingsIcon,
  ShieldIcon,
  StorefrontIcon,
  TruckIcon,
  UserCogIcon,
  cn,
} from "@ocean/ui";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

// Icons are resolved from a string key rather than passed as component references, because
// server-to-client props can't carry functions (NavItem is built in a Server Component layout).
export type NavIconKey =
  | "home"
  | "orders"
  | "products"
  | "collections"
  | "inventory"
  | "customers"
  | "companies"
  | "catalogs"
  | "pricing"
  | "quotes"
  | "storefront"
  | "analytics"
  | "settings"
  | "billing"
  | "users"
  | "developer"
  | "security"
  | "shipping"
  | "taxes"
  | "payments"
  | "data"
  | "files"
  | "activity"
  | "language";

const ICONS: Record<NavIconKey, ComponentType<IconProps>> = {
  home: HomeIcon,
  orders: OrdersIcon,
  products: ProductsIcon,
  collections: CollectionsIcon,
  inventory: InventoryIcon,
  customers: CustomersIcon,
  companies: CompaniesIcon,
  catalogs: CatalogsIcon,
  pricing: PricingIcon,
  quotes: QuotesIcon,
  storefront: StorefrontIcon,
  analytics: AnalyticsIcon,
  settings: SettingsIcon,
  billing: CreditCardIcon,
  users: UserCogIcon,
  developer: KeyIcon,
  security: ShieldIcon,
  shipping: TruckIcon,
  taxes: PercentIcon,
  payments: CreditCardIcon,
  data: DatabaseIcon,
  files: FolderIcon,
  activity: HistoryIcon,
  language: LanguagesIcon,
};

export interface NavItem {
  label: string;
  href: string;
  icon?: NavIconKey;
  disabled?: boolean;
  /** Opens outside the current route tree (e.g. an account-level page) — matched exactly, not as a prefix. */
  exactMatch?: boolean;
}

export interface NavGroup {
  heading: string;
  items: NavItem[];
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  // This component is shared across the in-scope app shell (Settings/Account sub-nav also
  // renders through it) — only this one fixed tooltip string is translated, since it's a small
  // reused chrome atom, not page content; see the i18n phase report.
  const t = useTranslations("shell.sidebar");
  const active = item.exactMatch
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon ? ICONS[item.icon] : undefined;
  if (item.disabled) {
    return (
      <span
        aria-disabled
        title={t("comingSoon")}
        className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground/50"
      >
        {Icon && <Icon size={16} className="shrink-0" />}
        {item.label}
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
        active
          ? "bg-accent font-medium text-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      {Icon && <Icon size={16} className="shrink-0" />}
      {item.label}
    </Link>
  );
}

// Flat, single-level nav list — used for sub-area navigation (Settings, Account) where a simple
// vertical list is all that's needed. The main app shell uses AppSidebar (app-sidebar.tsx) for
// the grouped, collapsible, pinnable top-level navigation.
//
// Pass `groups` instead of `items` for a sectioned list (e.g. Settings, which groups its real
// sub-pages under small uppercase headings) — both render the same NavLink so active-state and
// styling stay identical.
export function SidebarNav({ items, groups }: { items?: NavItem[]; groups?: NavGroup[] }) {
  const pathname = usePathname();
  if (groups) {
    return (
      <nav aria-label="Main" className="flex flex-col gap-4">
        {groups.map((group) => (
          <div key={group.heading} className="flex flex-col gap-0.5">
            <div className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
              {group.heading}
            </div>
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </div>
        ))}
      </nav>
    );
  }
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {(items ?? []).map((item) => (
        <NavLink key={item.href} item={item} pathname={pathname} />
      ))}
    </nav>
  );
}
