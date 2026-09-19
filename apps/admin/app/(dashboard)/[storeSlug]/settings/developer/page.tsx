import { Alert } from "@ocean/ui";
import { notFound } from "next/navigation";

import { can, findStore, requireMe } from "@/lib/session";

import { DeveloperManager } from "./developer-manager";

export const metadata = { title: "Developer · Ocean Admin" };

export default async function DeveloperPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const me = await requireMe(`/${storeSlug}/settings/developer`);
  const found = findStore(me, storeSlug);
  if (!found) notFound();
  const { store } = found;

  if (!can(store, "apps.install")) {
    return (
      <Alert variant="warning" title="Developer tools are restricted">
        Your role ({store.role?.replace(/_/g, " ") ?? "organization member"}) cannot manage apps,
        API keys, or webhooks. Ask a store owner, admin, or developer.
      </Alert>
    );
  }

  return <DeveloperManager storeId={store.id} />;
}
