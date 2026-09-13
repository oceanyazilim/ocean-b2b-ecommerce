import "server-only";

import {
  createPermissionSet,
  satisfies,
  type Permission,
  type PermissionRequirement,
} from "@ocean/permissions";
import type { MeOrganization, MeResponse, MeStore } from "@ocean/types";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { api, isApiError } from "./api";

export async function cookieHeader(): Promise<string> {
  const store = await cookies();
  return store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

export async function getMe(): Promise<MeResponse | null> {
  try {
    const res = await api<{ data: MeResponse }>("/auth/me", { cookie: await cookieHeader() });
    return res.data;
  } catch (error) {
    if (isApiError(error, "unauthenticated")) return null;
    throw error;
  }
}

export async function requireMe(next?: string): Promise<MeResponse> {
  const me = await getMe();
  if (!me) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return me;
}

export function findStore(
  me: MeResponse,
  slug: string,
): { organization: MeOrganization; store: MeStore } | null {
  for (const organization of me.organizations) {
    const store = organization.stores.find((s) => s.slug === slug);
    if (store) return { organization, store };
  }
  return null;
}

export function can(store: MeStore, requirement: PermissionRequirement): boolean {
  return satisfies(createPermissionSet(store.permissions as Permission[]), requirement);
}

// Where a signed-in user should land: onboarding until they have a store, else their first store.
export function homePath(me: MeResponse): string {
  const withStores = me.organizations.find((o) => o.stores.length > 0);
  if (withStores) return `/${withStores.stores[0]!.slug}`;
  if (me.organizations.length > 0) {
    return `/onboarding/store?organization=${me.organizations[0]!.id}`;
  }
  return "/onboarding/organization";
}
