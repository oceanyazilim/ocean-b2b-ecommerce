import { Alert } from "@ocean/ui";
import { notFound } from "next/navigation";

import { can, findStore, requireMe } from "@/lib/session";

import { GeneralSettingsForm } from "./general-settings-form";

export const metadata = { title: "General settings · Ocean Admin" };

export default async function GeneralSettingsPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const me = await requireMe(`/${storeSlug}/settings/general`);
  const found = findStore(me, storeSlug);
  if (!found) notFound();
  const { store } = found;

  if (!can(store, "settings.read")) {
    return <Alert variant="warning">Your role cannot view store settings.</Alert>;
  }

  return (
    <GeneralSettingsForm
      store={{
        id: store.id,
        name: store.name,
        defaultCurrency: store.defaultCurrency,
        defaultLocale: store.defaultLocale,
        timezone: store.timezone,
      }}
      editable={can(store, "settings.write")}
    />
  );
}
