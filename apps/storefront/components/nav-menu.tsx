"use client";

import type { MenuItemSummary } from "@ocean/types";
import { cn } from "@ocean/ui";
import Link from "next/link";
import { useRef, useState, type KeyboardEvent } from "react";

// Top-level nav rendering: a plain link for items with no children, a simple flyout for items
// with children, or a rich multi-column mega menu for items flagged `megaMenuEnabled`.
// Keyboard support: Tab moves focus in/out (dropdown opens on focus via focus-within tracking),
// Enter activates the focused link like any anchor, Escape closes the dropdown and returns
// focus to the trigger.
export function NavMenu({ items }: { items: MenuItemSummary[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-6 text-sm font-medium">
      {items.map((item) => (
        <NavMenuItem key={item.id} item={item} />
      ))}
    </ul>
  );
}

function NavMenuItem({ item }: { item: MenuItemSummary }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLLIElement>(null);
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const hasDropdown = item.children.length > 0;

  function handleKeyDown(e: KeyboardEvent<HTMLLIElement>) {
    if (e.key === "Escape" && open) {
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  return (
    <li
      ref={containerRef}
      className="relative"
      onMouseEnter={() => hasDropdown && setOpen(true)}
      onMouseLeave={() => hasDropdown && setOpen(false)}
      onFocus={() => hasDropdown && setOpen(true)}
      onBlur={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={handleKeyDown}
    >
      <Link
        ref={triggerRef}
        href={item.url ?? "#"}
        aria-haspopup={hasDropdown ? "true" : undefined}
        aria-expanded={hasDropdown ? open : undefined}
        className="flex items-center gap-1 text-foreground/80 transition-colors hover:text-foreground"
      >
        {item.label}
        {hasDropdown && (
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true" className="mt-px">
            <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </Link>
      {hasDropdown && open && (item.megaMenuEnabled ? <MegaMenuPanel item={item} /> : <FlyoutPanel item={item} />)}
    </li>
  );
}

function FlyoutPanel({ item }: { item: MenuItemSummary }) {
  return (
    <div
      role="menu"
      aria-label={item.label}
      className="absolute left-0 top-full z-40 mt-2 min-w-48 rounded-lg border bg-card p-2 text-card-foreground shadow-popover"
    >
      {item.children
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((child) => (
          <Link
            key={child.id}
            href={child.url ?? "#"}
            role="menuitem"
            className="block rounded-md px-3 py-2 text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
          >
            {child.label}
          </Link>
        ))}
    </div>
  );
}

function MegaMenuPanel({ item }: { item: MenuItemSummary }) {
  const columns = [...item.children].sort((a, b) => a.position - b.position);
  const hasPromo = !!(item.promoImageUrl || item.promoLinkUrl || item.promoLinkLabel);

  return (
    <div
      role="menu"
      aria-label={item.label}
      className="absolute left-1/2 top-full z-40 mt-2 w-screen max-w-3xl -translate-x-1/2 rounded-lg border bg-card p-6 text-card-foreground shadow-popover"
    >
      <div className={cn("grid gap-8", hasPromo && "grid-cols-[1fr_220px]")}>
        <div
          className="grid gap-6"
          style={{
            gridTemplateColumns: `repeat(${Math.max(1, Math.min(columns.length, 4))}, minmax(0, 1fr))`,
          }}
        >
          {columns.map((column) => (
            <div key={column.id} className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {column.label}
              </p>
              <ul className="flex flex-col gap-1.5">
                {[...column.children]
                  .sort((a, b) => a.position - b.position)
                  .map((link) => (
                    <li key={link.id}>
                      <Link
                        href={link.url ?? "#"}
                        role="menuitem"
                        className="text-sm text-foreground/80 transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
        {hasPromo && (
          <Link
            href={item.promoLinkUrl ?? "#"}
            role="menuitem"
            className="group flex flex-col overflow-hidden rounded-md border"
          >
            {item.promoImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.promoImageUrl}
                alt={item.promoImageAlt ?? ""}
                className="h-28 w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <div className="h-28 w-full bg-muted" />
            )}
            {item.promoLinkLabel && (
              <span className="px-3 py-2 text-sm font-medium text-foreground">{item.promoLinkLabel}</span>
            )}
          </Link>
        )}
      </div>
    </div>
  );
}
