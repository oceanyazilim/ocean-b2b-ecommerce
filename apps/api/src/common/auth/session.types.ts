export type SessionRealm = "merchant" | "platform" | "customer";

export interface SessionRecord {
  id: string;
  realm: SessionRealm;
  userId: string;
  createdAt: number;
  lastSeenAt: number;
  ip: string | null;
  userAgent: string | null;
  // True when the session was established through an MFA challenge (or MFA is not enabled).
  mfaVerified: boolean;
  // Epoch ms past which the session is dead regardless of activity — unlike the normal idle/
  // absolute TTLs, this can't be extended by touching the session. Used for impersonation
  // sessions, which must actually end, not just hide their banner.
  hardExpiresAt?: number;
}

export const MERCHANT_SESSION_COOKIE = "ocean_ms";

// Platform operators (apps/platform-admin) get their own cookie, name and all — never the
// merchant cookie — so a merchant browser session can never be mistaken for one, and vice versa.
export const PLATFORM_SESSION_COOKIE = "ocean_ps";

// One customer session cookie per store: a shopper can be signed into different stores
// (different tenants) independently, unlike merchant staff whose session spans their orgs.
export function customerSessionCookie(storeId: string): string {
  return `ocean_cs_${storeId}`;
}
