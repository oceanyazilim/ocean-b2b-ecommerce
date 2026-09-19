"use client";

import {
  AnalyticsIcon,
  CatalogsIcon,
  CollectionsIcon,
  CompaniesIcon,
  CustomersIcon,
  HomeIcon,
  type IconProps,
  InventoryIcon,
  OrdersIcon,
  PricingIcon,
  ProductsIcon,
  QuotesIcon,
  SettingsIcon,
  StorefrontIcon,
  cn,
} from "@ocean/ui";
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
  | "settings";

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
};

export interface NavItem {
  label: string;
  href: string;
  icon?: NavIconKey;
  disabled?: boolean;
}

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon ? ICONS[item.icon] : undefined;
        if (item.disabled) {
          return (
            <span
              key={item.href}
              aria-disabled
              title="Coming in a later phase"
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground/50"
            >
              {Icon && <Icon size={17} className="shrink-0" />}
              {item.label}
            </span>
          );
        }
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-accent font-semibold text-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            {Icon && <Icon size={17} className="shrink-0" />}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
