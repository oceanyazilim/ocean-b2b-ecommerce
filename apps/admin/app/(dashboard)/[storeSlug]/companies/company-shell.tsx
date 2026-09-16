import type { CompanyDetail } from "@ocean/types";
import { Badge } from "@ocean/ui";
import Link from "next/link";
import type { ReactNode } from "react";

import { SectionTabs } from "./company-nav";

const STATUS_BADGE = {
  active: "success",
  suspended: "warning",
  archived: "secondary",
} as const;

// Header + tab strip shared by the company detail pages (overview, locations, users).
export function CompanyShell({
  storeSlug,
  company,
  actions,
  children,
}: {
  storeSlug: string;
  company: CompanyDetail;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const base = `/${storeSlug}/companies/${company.id}`;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/${storeSlug}/companies`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Companies
          </Link>
          <h1 className="truncate text-2xl font-semibold tracking-tight">{company.displayName}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant={STATUS_BADGE[company.status]}>{company.status}</Badge>
            {company.legalName !== company.displayName && <span>{company.legalName}</span>}
            {company.taxNumber && <span>· Tax no. {company.taxNumber}</span>}
            <span>· {company.currency}</span>
            {company.accountManager && <span>· Managed by {company.accountManager.name}</span>}
          </div>
        </div>
        {actions}
      </div>
      <SectionTabs
        ariaLabel="Company sections"
        items={[
          { label: "Overview", href: base, exact: true },
          { label: "Locations", href: `${base}/locations`, count: company.locationCount },
          { label: "Users", href: `${base}/users`, count: company.userCount },
        ]}
      />
      {children}
    </div>
  );
}
