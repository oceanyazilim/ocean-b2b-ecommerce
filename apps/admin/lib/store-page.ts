import "server-only";

import type { MeOrganization, MeResponse, MeStore } from "@ocean/types";
import { notFound } from "next/navigation";

import { findStore, requireMe } from "./session";

export interface StorePage {
  me: MeResponse;
  organization: MeOrganization;
  store: MeStore;
}

// Every store-scoped page starts here: session, membership, store by slug.
export async function loadStorePage(storeSlug: string, path: string): Promise<StorePage> {
  const me = await requireMe(`/${storeSlug}${path}`);
  const found = findStore(me, storeSlug);
  if (!found) notFound();
  return { me, ...found };
}
