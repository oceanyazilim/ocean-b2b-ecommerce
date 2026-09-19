"use client";

import type {
  CompanySummary,
  CustomerSummary,
  OrderSummary,
  Paginated,
  ProductSummary,
} from "@ocean/types";
import { SearchIcon } from "@ocean/ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api } from "@/lib/api";

export interface PaletteNavItem {
  label: string;
  href: string;
  group: string;
  keywords?: string;
}

export interface PaletteSearchScope {
  products: boolean;
  orders: boolean;
  customers: boolean;
  companies: boolean;
}

interface PaletteResult {
  key: string;
  label: string;
  sublabel?: string | undefined;
  href: string;
  group: string;
}

const ENTITY_MIN_QUERY_LENGTH = 2;
const ENTITY_DEBOUNCE_MS = 250;

export function CommandPalette({
  storeId,
  storeSlug,
  navItems,
  searchScope,
}: {
  storeId: string;
  storeSlug: string;
  navItems: PaletteNavItem[];
  searchScope: PaletteSearchScope;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [entityResults, setEntityResults] = useState<PaletteResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  // Tracks the most recently kicked-off entity search query so a slower, now-stale response
  // (e.g. for a query the user has since changed or cleared) can't overwrite fresher results.
  const latestEntityQueryRef = useRef("");

  // Global Cmd+K / Ctrl+K toggle, available on every page inside the dashboard shell.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Native <dialog> gives us focus trapping, Escape-to-close and backdrop styling for free —
  // same primitive the shared Dialog component is built on (see packages/ui/src/dialog.tsx).
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setEntityResults([]);
    setActiveIndex(0);
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const navResults = useMemo<PaletteResult[]>(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? navItems.filter(
          (item) =>
            item.label.toLowerCase().includes(q) || item.keywords?.toLowerCase().includes(q),
        )
      : navItems;
    return matches.map((item) => ({
      key: `nav:${item.href}`,
      label: item.label,
      sublabel: item.group,
      href: item.href,
      group: "Go to",
    }));
  }, [navItems, query]);

  // Debounced live search against the same store-scoped list endpoints the admin's own list
  // pages already call (products/orders/customers/companies), reusing their `q` param.
  useEffect(() => {
    const q = query.trim();
    latestEntityQueryRef.current = q;
    if (q.length < ENTITY_MIN_QUERY_LENGTH) {
      setEntityResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      const params = new URLSearchParams({ limit: "5", q });
      const requests: Promise<PaletteResult[]>[] = [];

      if (searchScope.products) {
        requests.push(
          api<Paginated<ProductSummary>>(`/stores/${storeId}/products?${params}`)
            .then((res) =>
              res.data.map((p) => ({
                key: `product:${p.id}`,
                label: p.title,
                sublabel: p.vendor ?? p.productType ?? undefined,
                href: `/${storeSlug}/products/${p.id}`,
                group: "Products",
              })),
            )
            .catch(() => []),
        );
      }
      if (searchScope.orders) {
        requests.push(
          api<Paginated<OrderSummary>>(`/stores/${storeId}/orders?${params}`)
            .then((res) =>
              res.data.map((o) => ({
                key: `order:${o.id}`,
                label: o.name,
                sublabel: o.buyer.customer?.displayName ?? o.buyer.company?.displayName ?? o.email ?? undefined,
                href: `/${storeSlug}/orders/${o.id}`,
                group: "Orders",
              })),
            )
            .catch(() => []),
        );
      }
      if (searchScope.customers) {
        requests.push(
          api<Paginated<CustomerSummary>>(`/stores/${storeId}/customers?${params}`)
            .then((res) =>
              res.data.map((c) => ({
                key: `customer:${c.id}`,
                label: c.displayName,
                sublabel: c.email,
                href: `/${storeSlug}/customers/${c.id}`,
                group: "Customers",
              })),
            )
            .catch(() => []),
        );
      }
      if (searchScope.companies) {
        requests.push(
          api<Paginated<CompanySummary>>(`/stores/${storeId}/companies?${params}`)
            .then((res) =>
              res.data.map((c) => ({
                key: `company:${c.id}`,
                label: c.displayName,
                sublabel: c.legalName !== c.displayName ? c.legalName : undefined,
                href: `/${storeSlug}/companies/${c.id}`,
                group: "Companies",
              })),
            )
            .catch(() => []),
        );
      }

      void Promise.all(requests).then((all) => {
        // Ignore a response for a query that's no longer current — e.g. this was the request
        // for a longer query that resolves after the user has since shortened/changed it.
        if (latestEntityQueryRef.current !== q) return;
        setEntityResults(all.flat());
        setSearching(false);
      });
    }, ENTITY_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query, storeId, storeSlug, searchScope]);

  const results = useMemo<PaletteResult[]>(
    () => [...navResults, ...entityResults],
    [navResults, entityResults],
  );

  // Clamp instead of resetting to 0, so an in-flight entity search resolving doesn't yank
  // keyboard focus away from a nav result the user already arrowed down to.
  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(results.length - 1, 0)));
  }, [results.length]);

  const groups = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, PaletteResult[]>();
    for (const result of results) {
      if (!byGroup.has(result.group)) {
        byGroup.set(result.group, []);
        order.push(result.group);
      }
      byGroup.get(result.group)!.push(result);
    }
    return order.map((group) => ({ group, items: byGroup.get(group)! }));
  }, [results]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = results[activeIndex];
      if (target) go(target.href);
    }
  }

  useEffect(() => {
    const active = listRef.current?.querySelector('[data-active="true"]');
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  let flatIndex = -1;
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPod|iPad/.test(navigator.platform);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full max-w-56 items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
      >
        <SearchIcon size={15} className="shrink-0" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="hidden shrink-0 rounded border bg-muted px-1.5 py-0.5 text-[11px] font-medium sm:inline-block">
          {isMac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === dialogRef.current) setOpen(false);
        }}
        className="w-full max-w-xl rounded-xl border bg-card p-0 text-card-foreground shadow-popover backdrop:bg-black/40 open:animate-in"
        aria-label="Command palette"
      >
      <div className="flex max-h-[70vh] flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 border-b px-4 py-3">
          <SearchIcon size={17} className="shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Search products, orders, customers, companies or jump to a page…"
            aria-label="Command palette search"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden shrink-0 rounded border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline-block">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto p-2">
          {groups.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {searching ? "Searching…" : query.trim() ? "No results found." : "No matches."}
            </p>
          )}
          {groups.map(({ group, items }) => (
            <div key={group} className="mb-2 last:mb-0">
              <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group}
              </p>
              {items.map((item) => {
                flatIndex += 1;
                const isActive = flatIndex === activeIndex;
                return (
                  <button
                    key={item.key}
                    type="button"
                    data-active={isActive || undefined}
                    onMouseEnter={() => setActiveIndex(flatIndex)}
                    onClick={() => go(item.href)}
                    className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm ${
                      isActive ? "bg-accent text-foreground" : "text-foreground hover:bg-accent/60"
                    }`}
                  >
                    <span className="truncate font-medium">{item.label}</span>
                    {item.sublabel && (
                      <span className="shrink-0 truncate text-xs text-muted-foreground">
                        {item.sublabel}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
          {searching && groups.length > 0 && (
            <p className="px-3 py-1.5 text-xs text-muted-foreground">Searching…</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t px-4 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-medium">↑</kbd>
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-medium">↓</kbd>
            Navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-medium">↵</kbd>
            Select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-medium">Esc</kbd>
            Close
          </span>
        </div>
      </div>
      </dialog>
    </>
  );
}
