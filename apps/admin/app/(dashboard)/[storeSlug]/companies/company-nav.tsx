"use client";

import { SectionTabs } from "@/components/section-tabs";

export { SectionTabs };

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
