import { z } from "zod";

export const DEVELOPER_APP_STATUSES = ["active", "revoked"] as const;
export const developerAppStatusSchema = z.enum(DEVELOPER_APP_STATUSES);
export type DeveloperAppStatus = z.infer<typeof developerAppStatusSchema>;

export const createDeveloperAppInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(z.string()).min(1).max(50),
});
export type CreateDeveloperAppInput = z.infer<typeof createDeveloperAppInputSchema>;

export interface DeveloperAppSummary {
  id: string;
  name: string;
  clientId: string;
  scopes: string[];
  status: DeveloperAppStatus;
  createdAt: string;
}

// Only present once, in the response to creation or secret rotation — never stored or
// returned again after that.
export interface DeveloperAppCreated extends DeveloperAppSummary {
  clientSecret: string;
}

// A pragmatic simplification of RFC 6749 client_credentials: JSON body instead of
// application/x-www-form-urlencoded, since every other surface in this API is JSON and there's
// no third-party OAuth client library this needs to interoperate with yet.
export const oauthTokenInputSchema = z.object({
  grant_type: z.literal("client_credentials"),
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
});
export type OAuthTokenInput = z.infer<typeof oauthTokenInputSchema>;

export interface OAuthTokenResponse {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  scope: string;
}

export const createApiKeyInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(z.string()).min(1).max(50),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeyInputSchema>;

export const API_KEY_KINDS = ["static", "oauth_token"] as const;
export const apiKeyKindSchema = z.enum(API_KEY_KINDS);
export type ApiKeyKind = z.infer<typeof apiKeyKindSchema>;

export interface ApiKeySummary {
  id: string;
  name: string;
  scopes: string[];
  kind: ApiKeyKind;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface ApiKeyCreated extends ApiKeySummary {
  secret: string;
}

export const WEBHOOK_STATUSES = ["active", "disabled"] as const;
export const webhookStatusSchema = z.enum(WEBHOOK_STATUSES);
export type WebhookStatus = z.infer<typeof webhookStatusSchema>;

export const createWebhookInputSchema = z.object({
  topic: z.string().trim().min(1).max(100),
  url: z.string().url().max(2000),
});
export type CreateWebhookInput = z.infer<typeof createWebhookInputSchema>;

export interface WebhookSummary {
  id: string;
  topic: string;
  url: string;
  status: WebhookStatus;
  createdAt: string;
}

export interface WebhookCreated extends WebhookSummary {
  secret: string;
}

export const WEBHOOK_DELIVERY_STATUSES = ["pending", "delivered", "failed"] as const;
export const webhookDeliveryStatusSchema = z.enum(WEBHOOK_DELIVERY_STATUSES);
export type WebhookDeliveryStatus = z.infer<typeof webhookDeliveryStatusSchema>;

export interface WebhookDeliverySummary {
  id: string;
  eventId: string;
  attempt: number;
  status: WebhookDeliveryStatus;
  responseCode: number | null;
  deliveredAt: string | null;
  createdAt: string;
}

export const createAppBlockDefinitionInputSchema = z.object({
  type: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z][a-z0-9_-]*$/, "lowercase letters, digits, - and _ only"),
  label: z.string().trim().min(1).max(120),
  settingsSchema: z.array(z.record(z.string(), z.unknown())).max(50).default([]),
});
export type CreateAppBlockDefinitionInput = z.infer<typeof createAppBlockDefinitionInputSchema>;

export interface AppBlockDefinitionSummary {
  id: string;
  type: string;
  label: string;
  settingsSchema: Record<string, unknown>[];
  createdAt: string;
}
