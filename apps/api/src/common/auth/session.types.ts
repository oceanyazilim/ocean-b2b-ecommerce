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
}

export const MERCHANT_SESSION_COOKIE = "ocean_ms";
