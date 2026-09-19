"use client";

import {
  CompaniesIcon,
  CustomersIcon,
  HomeIcon,
  InventoryIcon,
  type IconProps,
  OrdersIcon,
  PricingIcon,
  QuotesIcon,
} from "@ocean/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

import { LogoutButton } from "./logout-button";

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<IconProps>;
}

export function AccountSidebar({
  customerName,
  companyName,
  showCompanyNav,
  showTeamNav,
  showInvoicesNav,
}: {
  customerName: string;
  companyName: string | null;
  showCompanyNav: boolean;
  showTeamNav: boolean;
  showInvoicesNav: boolean;
}) {
  const pathname = usePathname();

  const items: NavItem[] = [
    { href: "/account", label: "Overview", icon: HomeIcon },
    { href: "/account/orders", label: "Orders", icon: OrdersIcon },
    ...(showCompanyNav ? [{ href: "/account/quotes", label: "Quotes", icon: QuotesIcon }] : []),
    ...(showInvoicesNav ? [{ href: "/account/invoices", label: "Invoices", icon: PricingIcon }] : []),
    ...(showCompanyNav ? [{ href: "/account/company", label: "Company", icon: CompaniesIcon }] : []),
    ...(showTeamNav ? [{ href: "/account/team", label: "Team", icon: CustomersIcon }] : []),
    { href: "/account/addresses", label: "Addresses", icon: InventoryIcon },
  ];

  return (
    <aside className="w-full shrink-0 md:w-56">
      <div className="mb-6">
        <p className="text-sm font-medium text-foreground">{customerName}</p>
        {companyName && <p className="text-sm text-muted-foreground">{companyName}</p>}
      </div>
      <nav className="flex flex-row flex-wrap gap-1 md:flex-col">
        {items.map((item) => {
          const active = item.href === "/account" ? pathname === item.href : pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active ? "bg-accent text-foreground" : "text-foreground/70 hover:bg-accent hover:text-foreground"
              }`}
            >
              <Icon size={17} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-6 border-t pt-4">
        <LogoutButton />
      </div>
    </aside>
  );
}
