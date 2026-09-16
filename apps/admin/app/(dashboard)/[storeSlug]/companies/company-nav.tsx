"use client";

import { cn } from "@ocean/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function SectionTabs({
  items,
  ariaLabel,
}: {
  items: { label: string; href: string; exact?: boolean; count?: number | undefined }[];
  ariaLabel: string;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label={ariaLabel} className="flex gap-1 overflow-x-auto border-b">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
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
            {item.count !== undefined && item.count > 0 && (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
                {item.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function CompaniesNav({
  storeSlug,
  pendingApplications,
}: {
  storeSlug: string;
  pendingApplications?: number | undefined;
}) {
  const base = `/${storeSlug}/companies`;
  return (
    <SectionTabs
      ariaLabel="Company sections"
      items={[
        { label: "Companies", href: base, exact: true },
        { label: "Applications", href: `${base}/applications`, count: pendingApplications },
      ]}
    />
  );
}
