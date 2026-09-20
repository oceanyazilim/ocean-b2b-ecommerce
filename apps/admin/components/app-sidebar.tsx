"use client";

import {
  AnalyticsIcon,
  CatalogsIcon,
  ChevronDownIcon,
  CollectionsIcon,
  CompaniesIcon,
  CustomersIcon,
  HomeIcon,
  type IconProps,
  InventoryIcon,
  OrdersIcon,
  PanelLeftIcon,
  PinIcon,
  PricingIcon,
  ProductsIcon,
  QuotesIcon,
  SettingsIcon,
  StorefrontIcon,
  cn,
} from "@ocean/ui";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";

// Icons are resolved from a string key (rather than passed as component references) because
// server-to-client props can't carry functions — this data is built in a Server Component layout.
export type AppNavIconKey =
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

const ICONS: Record<AppNavIconKey, ComponentType<IconProps>> = {
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

export interface AppNavLink {
  label: string;
  href: string;
  icon: AppNavIconKey;
}

export interface AppNavGroup {
  label: string;
  items: AppNavLink[];
}

const COLLAPSE_KEY = "ocean.sidebar.collapsed";

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Best-effort only — a full/blocked localStorage should never break navigation.
  }
}

export function AppSidebar({
  storeId,
  orgName,
  home,
  groups,
  settingsItem,
  switcher,
  user,
}: {
  storeId: string;
  orgName: string;
  home: AppNavLink;
  groups: AppNavGroup[];
  settingsItem: AppNavLink;
  switcher: ReactNode;
  user: { name: string; initials: string; href: string };
}) {
  const t = useTranslations("shell.sidebar");
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [favorites, setFavorites] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const favoritesKey = `ocean.favorites.${storeId}`;
  const groupsKey = `ocean.sidebar.openGroups.${storeId}`;

  // Collapse is a device-level preference; pins and group-open state are scoped per store, since
  // a user's favorite pages naturally differ between stores.
  useEffect(() => {
    setCollapsed(readJSON(COLLAPSE_KEY, false));
    setOpenGroups(readJSON(groupsKey, {}));
    setFavorites(readJSON(favoritesKey, []));
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      writeJSON(COLLAPSE_KEY, next);
      return next;
    });
  }

  function toggleGroup(label: string) {
    setOpenGroups((prev) => {
      const next = { ...prev, [label]: !(prev[label] ?? true) };
      writeJSON(groupsKey, next);
      return next;
    });
  }

  function toggleFavorite(href: string) {
    setFavorites((prev) => {
      const next = prev.includes(href) ? prev.filter((h) => h !== href) : [...prev, href];
      writeJSON(favoritesKey, next);
      return next;
    });
  }

  const allLinks = useMemo(
    () => [home, ...groups.flatMap((g) => g.items), settingsItem],
    [home, groups, settingsItem],
  );
  const favoriteLinks = hydrated ? allLinks.filter((l) => favorites.includes(l.href)) : [];

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r bg-background",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className={cn("flex items-center gap-1.5 px-2.5 py-3", collapsed && "justify-center px-1.5")}>
        {!collapsed && <div className="min-w-0 flex-1">{switcher}</div>}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? t("expandSidebar") : t("collapseSidebar")}
          title={collapsed ? t("expandSidebar") : t("collapseSidebar")}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <PanelLeftIcon size={16} />
        </button>
      </div>
      {!collapsed && <p className="truncate px-3.5 pb-2 text-xs text-muted-foreground">{orgName}</p>}

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {favoriteLinks.length > 0 && (
          <div className="mb-3">
            {!collapsed && (
              <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                {t("favorites")}
              </p>
            )}
            <div className="flex flex-col gap-0.5">
              {favoriteLinks.map((item) => (
                <NavLink
                  key={`fav-${item.href}`}
                  item={item}
                  collapsed={collapsed}
                  active={isActive(item.href)}
                  pinned
                  onTogglePin={() => toggleFavorite(item.href)}
                />
              ))}
            </div>
          </div>
        )}

        <NavLink
          item={home}
          collapsed={collapsed}
          active={isActive(home.href)}
          pinned={favorites.includes(home.href)}
          onTogglePin={() => toggleFavorite(home.href)}
        />

        {groups.map((group) => {
          const containsActive = group.items.some((item) => isActive(item.href));
          const open = collapsed || containsActive || (openGroups[group.label] ?? true);
          return (
            <div key={group.label} className="mt-3">
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80 hover:text-foreground"
                >
                  {group.label}
                  <ChevronDownIcon size={13} className={cn("transition-transform", !open && "-rotate-90")} />
                </button>
              )}
              {open && (
                <div className="flex flex-col gap-0.5">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.href}
                      item={item}
                      collapsed={collapsed}
                      active={isActive(item.href)}
                      pinned={favorites.includes(item.href)}
                      onTogglePin={() => toggleFavorite(item.href)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t px-2 py-2">
        <NavLink
          item={settingsItem}
          collapsed={collapsed}
          active={isActive(settingsItem.href)}
          pinned={favorites.includes(settingsItem.href)}
          onTogglePin={() => toggleFavorite(settingsItem.href)}
        />
        <Link
          href={user.href}
          title={collapsed ? user.name : undefined}
          className={cn(
            "mt-1 flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent/60",
            collapsed && "justify-center px-0",
          )}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold">
            {user.initials || "U"}
          </span>
          {!collapsed && <span className="min-w-0 flex-1 truncate font-medium">{user.name}</span>}
        </Link>
      </div>
    </aside>
  );
}

function NavLink({
  item,
  collapsed,
  active,
  pinned,
  onTogglePin,
}: {
  item: AppNavLink;
  collapsed: boolean;
  active: boolean;
  pinned: boolean;
  onTogglePin: () => void;
}) {
  const t = useTranslations("shell.sidebar");
  const Icon = ICONS[item.icon];
  return (
    <div className="group/item relative flex items-center">
      <Link
        href={item.href}
        title={collapsed ? item.label : undefined}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex flex-1 items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
          collapsed && "justify-center px-0",
          active
            ? "bg-accent font-medium text-foreground"
            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        )}
      >
        <Icon size={16} className="shrink-0" />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
      {!collapsed && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onTogglePin();
          }}
          aria-label={pinned ? t("unpinItem", { label: item.label }) : t("pinItem", { label: item.label })}
          aria-pressed={pinned}
          className={cn(
            "absolute right-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground",
            pinned ? "text-foreground opacity-100" : "opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100",
          )}
        >
          <PinIcon size={13} />
        </button>
      )}
    </div>
  );
}
