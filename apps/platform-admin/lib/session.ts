import "server-only";

import type { PlatformMeResponse } from "@ocean/types";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { api, isApiError } from "./api";

// Deliberately its own module, not a copy of apps/admin's lib/session.ts wired to a different
// cookie: there is no MeResponse/organizations/stores concept here at all. A platform operator
// isn't a store member — this only ever resolves a PlatformOperator against the platform/auth/me
// endpoint, which reads the ocean_ps cookie (see apps/api's PlatformSessionGuard), never
// apps/admin's ocean_ms merchant cookie. A merchant session cookie sent to this app's server
// components is simply never read.
export async function cookieHeader(): Promise<string> {
  const store = await cookies();
  return store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

export async function getPlatformOperator(): Promise<PlatformMeResponse | null> {
  try {
    const res = await api<{ data: PlatformMeResponse }>("/auth/me", { cookie: await cookieHeader() });
    return res.data;
  } catch (error) {
    if (isApiError(error, "unauthenticated")) return null;
    throw error;
  }
}

export async function requirePlatformOperator(next?: string): Promise<PlatformMeResponse> {
  const me = await getPlatformOperator();
  if (!me) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return me;
}
