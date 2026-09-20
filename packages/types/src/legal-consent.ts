import { z } from "zod";

// ---------------------------------------------------------------------------
// L6 Global Localization: market-specific legal content (spec section 46)
// ---------------------------------------------------------------------------

// Platform-owned catalog row: one "type" of legal page a country conventionally needs (e.g.
// Germany's "impressum", Turkey's "kvkk_aydinlatma_metni"). See LegalPageRequirement in
// packages/db's schema for the full comment on why this is data, never a hardcoded list.
export interface LegalPageRequirementSummary {
  id: string;
  countryCode: string;
  code: string;
  label: string;
  description: string | null;
  isRequired: boolean;
  position: number;
}

// One requirement, resolved against a specific store's Pages: either a real Page already
// fulfills it (status "created") or none does yet (status "missing").
export interface LegalRequirementStatus {
  code: string;
  label: string;
  description: string | null;
  isRequired: boolean;
  status: "created" | "missing";
  page: {
    id: string;
    title: string;
    handle: string;
    status: "draft" | "published" | "archived";
  } | null;
}

// Per-active-market legal content status, the shape the admin Legal screen renders directly.
export interface MarketLegalStatus {
  marketId: string;
  marketName: string;
  countryCode: string;
  requirements: LegalRequirementStatus[];
}

// ---------------------------------------------------------------------------
// L6 Global Localization: cookie & privacy consent framework (spec section 47)
// ---------------------------------------------------------------------------

// Fixed taxonomy the spec names verbatim as "reasonable defaults". Necessary is never
// toggleable by a visitor — every other category may be granted or denied independently.
export const CONSENT_CATEGORIES = ["necessary", "functional", "analytics", "marketing"] as const;
export const consentCategorySchema = z.enum(CONSENT_CATEGORIES);
export type ConsentCategory = z.infer<typeof consentCategorySchema>;

export interface ConsentCategoryDefinition {
  key: ConsentCategory;
  label: string;
  description: string;
  isAlwaysOn: boolean;
}

// What the storefront's own visitor-consent decision looked like — booleans per category, plus
// how the visitor arrived at them (accept-all / reject-all / the customize panel).
export const consentDecisionSchema = z.object({
  functional: z.boolean().default(false),
  analytics: z.boolean().default(false),
  marketing: z.boolean().default(false),
  source: z.enum(["accept_all", "reject_all", "customize"]),
  // The market/country the banner resolved for this visitor when it was shown — recorded for
  // the compliance log, not re-derived later. Optional: a storefront that has no markets
  // configured yet still gets a working (permissive-default) banner.
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  marketId: z.string().uuid().optional(),
});
export type ConsentDecisionInput = z.infer<typeof consentDecisionSchema>;

export interface ConsentRecordSummary {
  id: string;
  visitorId: string;
  customerId: string | null;
  countryCode: string | null;
  marketId: string | null;
  necessary: boolean;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
  source: string;
  createdAt: string;
}

// GET /storefront/v1/consent/rules — what the banner needs to render itself and decide its
// default state for this visitor's resolved market.
export interface ConsentRulesResponse {
  categories: ConsentCategoryDefinition[];
  // Market rules (spec section 47): true = every non-necessary category must default to OFF
  // until the visitor opts in (GDPR/KVKK-style); false = they may default to ON until the
  // visitor opts out. Resolved from the visitor's market's CountryProfile.consentOptInRequired,
  // falling back to the conservative (true) default when no market/country context is known.
  optInRequired: boolean;
  countryCode: string | null;
  // The visitor's existing choice, if the consent cookie already resolved to a logged record —
  // lets the storefront skip re-showing the banner without a second network round trip.
  current: {
    necessary: boolean;
    functional: boolean;
    analytics: boolean;
    marketing: boolean;
  } | null;
}

// ---------------------------------------------------------------------------
// Third-party script controls (spec section 47) — merchant-configured list only, see
// TrackingScript's schema comment for the honest scope boundary of this pass.
// ---------------------------------------------------------------------------

export const trackingScriptInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  provider: z.string().trim().max(160).nullable().optional(),
  category: consentCategorySchema,
  snippet: z.string().trim().max(4000).nullable().optional(),
  isEnabled: z.boolean().default(true),
});
export type TrackingScriptInput = z.infer<typeof trackingScriptInputSchema>;

export const updateTrackingScriptSchema = trackingScriptInputSchema.partial();
export type UpdateTrackingScriptInput = z.infer<typeof updateTrackingScriptSchema>;

export interface TrackingScriptSummary {
  id: string;
  name: string;
  provider: string | null;
  category: ConsentCategory;
  snippet: string | null;
  isEnabled: boolean;
  // Computed from the store's own consent-rule defaults (not any particular visitor's choice):
  // whether this script's category is allowed to run before any visitor has made an explicit
  // choice. A real loader integration should still gate the actual script tag on that specific
  // visitor's ConsentRecord, not on this field — see the module comment on ConsentService.
  allowedByDefault: boolean;
  createdAt: string;
  updatedAt: string;
}
