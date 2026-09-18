import type { ShippingZoneDetail } from "@ocean/types";
import { Alert } from "@ocean/ui";
import Link from "next/link";
import { notFound } from "next/navigation";

import { api, isApiError } from "@/lib/api";
import { can, cookieHeader } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { ZoneDetailView } from "./zone-detail";

export const metadata = { title: "Shipping zone · Ocean Admin" };

export default async function ZonePage({
  params,
}: {
  params: Promise<{ storeSlug: string; zoneId: string }>;
}) {
  const { storeSlug, zoneId } = await params;
  const { store } = await loadStorePage(storeSlug, `/settings/shipping/${zoneId}`);
  if (!can(store, "shipping.read"))
    return <Alert variant="warning">Your role cannot view shipping settings.</Alert>;
  let zone: ShippingZoneDetail;
  try {
    zone = (
      await api<{ data: ShippingZoneDetail }>(`/stores/${store.id}/shipping/zones/${zoneId}`, {
        cookie: await cookieHeader(),
      })
    ).data;
  } catch (err) {
    if (isApiError(err, "not_found")) notFound();
    throw err;
  }
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link
          href={`/${storeSlug}/settings/shipping`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Shipping zones
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">{zone.name}</h1>
      </div>
      <ZoneDetailView storeId={store.id} zone={zone} canWrite={can(store, "shipping.write")} />
    </div>
  );
}
