import type { AuditLogEntry, Paginated } from "@ocean/types";
import { Alert } from "@ocean/ui";
import { notFound } from "next/navigation";

import { api, API_URL } from "@/lib/api";
import { can, cookieHeader, findStore, requireMe } from "@/lib/session";

import { ActivityLog } from "./activity-log";

export const metadata = { title: "Activity log · Ocean Admin" };

// Every resource type this store's audit writer has actually emitted rows for (Phase 16 —
// custom_role, developer_app, api_key, webhook, impersonation_session — plus the earlier
// commerce resources). Kept as a literal list rather than a DISTINCT query so the filter
// dropdown renders without an extra round trip; it mirrors AuditController's real callers.
const RESOURCE_TYPES = [
  "order",
  "product",
  "customer",
  "company",
  "custom_role",
  "developer_app",
  "api_key",
  "webhook",
  "impersonation_session",
];

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<{ cursor?: string; resourceType?: string; from?: string; to?: string }>;
}) {
  const { storeSlug } = await params;
  const { cursor, resourceType, from, to } = await searchParams;
  const me = await requireMe(`/${storeSlug}/settings/audit`);
  const found = findStore(me, storeSlug);
  if (!found) notFound();
  const { store } = found;

  if (!can(store, "settings.read")) {
    return <Alert variant="warning">Your role cannot view the activity log.</Alert>;
  }

  // "to" is a date-only input (YYYY-MM-DD) but the API's `to` bound is an instant — push it to
  // the end of that calendar day so filtering "to 2026-09-20" includes everything that happened
  // on the 20th, not just up to midnight at its start.
  const fromIso = from ? new Date(from).toISOString() : undefined;
  const toIso = to ? new Date(`${to}T23:59:59.999Z`).toISOString() : undefined;

  const query = new URLSearchParams({
    limit: "50",
    ...(cursor ? { cursor } : {}),
    ...(resourceType ? { resourceType } : {}),
    ...(fromIso ? { from: fromIso } : {}),
    ...(toIso ? { to: toIso } : {}),
  });
  const page = await api<Paginated<AuditLogEntry>>(
    `/stores/${store.id}/audit-logs?${query.toString()}`,
    { cookie: await cookieHeader() },
  );
  const exportParams = new URLSearchParams({
    ...(resourceType ? { resourceType } : {}),
    ...(fromIso ? { from: fromIso } : {}),
    ...(toIso ? { to: toIso } : {}),
  });
  const exportUrl = `${API_URL}/admin/v1/stores/${store.id}/audit-logs/export${exportParams.toString() ? `?${exportParams.toString()}` : ""}`;

  return (
    <ActivityLog
      storeSlug={storeSlug}
      page={page}
      resourceTypes={RESOURCE_TYPES}
      resourceType={resourceType ?? ""}
      from={from ?? ""}
      to={to ?? ""}
      exportUrl={exportUrl}
    />
  );
}
