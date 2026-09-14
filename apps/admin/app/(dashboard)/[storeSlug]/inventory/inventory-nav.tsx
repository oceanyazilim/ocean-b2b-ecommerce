"use client";

import { cn } from "@ocean/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function InventoryNav({ storeSlug }: { storeSlug: string }) {
  const pathname = usePathname();
  const base = `/${storeSlug}/inventory`;
  const items = [
    { label: "Stock", href: base },
    { label: "Transfers", href: `${base}/transfers` },
    { label: "Movements", href: `${base}/movements` },
    { label: "Locations", href: `${base}/locations` },
  ];
  return (
    <nav aria-label="Inventory sections" className="flex gap-1 overflow-x-auto border-b">
      {items.map((item) => {
        const active = item.href === base ? pathname === base : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
