"use client";

import type {
  BusinessVerificationCategory,
  BusinessVerificationCategoryStatus,
  BusinessVerificationStatus,
  OrganizationBusinessVerification,
} from "@ocean/types";
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from "@ocean/ui";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { api, errorMessage } from "@/lib/api";

// Business verification (spec section 30): Settings -> Business Verification. Every status below
// is derived live from real data this platform already collects — the L2 business-profile/
// address answers and the L3 tax registrations — never a manual toggle or a fabricated pass. Two
// categories (Identity verification, Banking information) have no real data source anywhere in
// this codebase yet; they always read "Not collected" here rather than pretending to check
// something that doesn't exist, with a note explaining that's a future integration point, not a
// failed check.
const OVERALL_LABEL: Record<BusinessVerificationStatus, string> = {
  unverified: "Unverified",
  action_required: "Action required",
  verified: "Verified",
};
const OVERALL_VARIANT: Record<BusinessVerificationStatus, "secondary" | "warning" | "success"> = {
  unverified: "secondary",
  action_required: "warning",
  verified: "success",
};
const CATEGORY_LABEL: Record<BusinessVerificationCategoryStatus, string> = {
  complete: "Complete",
  action_required: "Action required",
  not_collected: "Not collected",
};
const CATEGORY_VARIANT: Record<BusinessVerificationCategoryStatus, "secondary" | "warning" | "success"> = {
  complete: "success",
  action_required: "warning",
  not_collected: "secondary",
};

export function BusinessVerificationPanel({
  organizationId,
  storeSlug,
}: {
  organizationId: string;
  storeSlug: string;
}) {
  const [data, setData] = useState<OrganizationBusinessVerification | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ data: OrganizationBusinessVerification }>(
        `/organizations/${organizationId}/business-verification`,
      );
      setData(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  function settingsHref(category: BusinessVerificationCategory): string | null {
    if (!category.settingsPage) return null;
    return `/${storeSlug}/settings/${category.settingsPage}`;
  }

  if (loading && !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Business verification</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error && !data) {
    return <Alert variant="error">{error}</Alert>;
  }

  if (!data) return null;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Business verification</CardTitle>
            <CardDescription>
              Whether your business meets the data requirements this store, its country and its
              payment providers ask for. This checks completeness of the information you&rsquo;ve
              already entered — it is not a document-based identity check.
            </CardDescription>
          </div>
          <Badge variant={OVERALL_VARIANT[data.status]} className="shrink-0 text-sm">
            {OVERALL_LABEL[data.status]}
          </Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error && <Alert variant="error">{error}</Alert>}
          <p className="text-xs text-muted-foreground">
            Last checked {new Date(data.checkedAt).toLocaleString()}
          </p>
          <Button variant="outline" onClick={() => void load()} loading={loading}>
            Re-check now
          </Button>

          <div className="flex flex-col divide-y">
            {data.categories.map((category) => {
              const href = settingsHref(category);
              return (
                <div key={category.key} className="flex items-start justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{category.label}</p>
                      <Badge variant={CATEGORY_VARIANT[category.status]}>
                        {CATEGORY_LABEL[category.status]}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{category.message}</p>
                  </div>
                  {href && category.status !== "complete" && (
                    <Link
                      href={href}
                      className="shrink-0 text-sm font-medium text-primary underline-offset-2 hover:underline"
                    >
                      Fix it
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
