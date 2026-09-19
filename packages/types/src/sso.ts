import { z } from "zod";

export const SSO_CONNECTION_STATUSES = ["active", "disabled"] as const;
export const ssoConnectionStatusSchema = z.enum(SSO_CONNECTION_STATUSES);
export type SsoConnectionStatus = z.infer<typeof ssoConnectionStatusSchema>;

export const upsertSsoConnectionInputSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Enter a domain, e.g. acme.com"),
  issuer: z.string().url(),
  authorizationEndpoint: z.string().url(),
  tokenEndpoint: z.string().url(),
  userinfoEndpoint: z.string().url(),
  clientId: z.string().trim().min(1).max(255),
  clientSecret: z.string().trim().min(1).max(500),
  defaultRole: z.enum(["owner", "admin", "billing", "member"]).default("member"),
});
export type UpsertSsoConnectionInput = z.infer<typeof upsertSsoConnectionInputSchema>;

export interface SsoConnectionSummary {
  domain: string;
  issuer: string;
  clientId: string;
  defaultRole: string;
  status: SsoConnectionStatus;
  startUrl: string;
  createdAt: string;
}
