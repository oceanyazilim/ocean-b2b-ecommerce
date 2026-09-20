import { z } from "zod";

// ---------------------------------------------------------------------------
// L4 Global Localization — storefront languages & translations.
//
// Scope boundary (see the API module's content.service.ts comment and the phase report for the
// full explanation): the *wired-up* translatable entity types in this pass are "product" and
// "system_label". The Translation table itself is fully generic — (entityType, entityId, locale,
// field) — so Collections/Pages/Articles/Menus/checkout content/theme-section content can reuse
// it in a later pass without a schema or API-shape change, only new controller wiring.
// ---------------------------------------------------------------------------

// Loose BCP-47-ish check ("en", "en-US", "zh-Hans-CN", ...) — deliberately not an enum, per spec
// section 2 ("must never hardcode a limited number of languages").
export const localeCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(35)
  .regex(/^[a-zA-Z]{2,8}(-[a-zA-Z0-9]{1,8})*$/, "Use a BCP-47 style locale code, e.g. en-US");

export const TRANSLATABLE_ENTITY_TYPES = ["product", "system_label"] as const;
export const translatableEntityTypeSchema = z.enum(TRANSLATABLE_ENTITY_TYPES);
export type TranslatableEntityType = (typeof TRANSLATABLE_ENTITY_TYPES)[number];

export const TRANSLATION_STATUSES = ["draft", "reviewed", "published"] as const;
export const translationStatusSchema = z.enum(TRANSLATION_STATUSES);
export type TranslationStatus = z.infer<typeof translationStatusSchema>;

// ---- store languages --------------------------------------------------------------------------

export const storeLanguageInputSchema = z.object({
  locale: localeCodeSchema,
  isDefault: z.boolean().default(false),
  isPublished: z.boolean().default(false),
});
export type StoreLanguageInput = z.infer<typeof storeLanguageInputSchema>;

export const updateStoreLanguageSchema = z.object({
  isDefault: z.boolean().optional(),
  isPublished: z.boolean().optional(),
});
export type UpdateStoreLanguageInput = z.infer<typeof updateStoreLanguageSchema>;

export interface StoreLanguageSummary {
  id: string;
  locale: string;
  isDefault: boolean;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---- translations (generic entityType/entityId/locale/field) ----------------------------------

export const upsertTranslationSchema = z.object({
  entityType: translatableEntityTypeSchema,
  entityId: z.string().trim().min(1).max(200),
  locale: localeCodeSchema,
  field: z.string().trim().min(1).max(60),
  value: z.string().max(100_000),
  status: translationStatusSchema.optional(),
});
export type UpsertTranslationInput = z.infer<typeof upsertTranslationSchema>;

export const translationStatusUpdateSchema = z.object({ status: translationStatusSchema });
export type TranslationStatusUpdateInput = z.infer<typeof translationStatusUpdateSchema>;

export interface TranslationEntry {
  id: string;
  entityType: string;
  entityId: string;
  locale: string;
  field: string;
  value: string;
  status: TranslationStatus;
  updatedAt: string;
}

// Product translation fields wired up in this pass (spec section 5): title, description, SEO
// title/description. Bulk upsert — the Translations UI saves all four fields of one product/
// locale pair in a single call.
export const PRODUCT_TRANSLATABLE_FIELDS = ["title", "descriptionHtml", "seoTitle", "seoDescription"] as const;
export type ProductTranslatableField = (typeof PRODUCT_TRANSLATABLE_FIELDS)[number];

export const productTranslationInputSchema = z.object({
  locale: localeCodeSchema,
  title: z.string().trim().max(255).nullable().optional(),
  descriptionHtml: z.string().max(100_000).nullable().optional(),
  seoTitle: z.string().trim().max(70).nullable().optional(),
  seoDescription: z.string().trim().max(320).nullable().optional(),
  status: translationStatusSchema.optional(),
});
export type ProductTranslationInput = z.infer<typeof productTranslationInputSchema>;

export interface ProductTranslationField {
  value: string;
  status: TranslationStatus;
  updatedAt: string;
  // A translation-memory match found for this field's *source* (default-language) text, if any —
  // surfaced by the Translations UI as a one-click "use this" suggestion (spec section 7).
  memorySuggestion: string | null;
}

export interface ProductTranslationDetail {
  productId: string;
  productTitle: string;
  productHandle: string;
  sourceLocale: string;
  locale: string;
  fields: Record<ProductTranslatableField, ProductTranslationField | null>;
  source: Record<ProductTranslatableField, string | null>;
}

export interface ProductTranslationListItem {
  productId: string;
  productTitle: string;
  productHandle: string;
  // Coarse per-product status for the picked locale: "not_translated" if no field has a
  // translation row yet, otherwise the least-advanced status among translated fields (draft <
  // reviewed < published) so a merchant scanning the list sees what still needs attention.
  status: TranslationStatus | "not_translated";
  translatedFieldCount: number;
  totalFieldCount: number;
}

export const productTranslationListQuerySchema = z.object({
  locale: localeCodeSchema,
  q: z.string().trim().max(120).optional(),
});
export type ProductTranslationListQuery = z.infer<typeof productTranslationListQuerySchema>;

// ---- translation memory (spec section 7) -------------------------------------------------------

export interface TranslationMemoryLookupResult {
  targetText: string;
  updatedAt: string;
}

// ---- glossary (spec section 7: brand terms that must never be translated) ----------------------

export const glossaryTermInputSchema = z.object({
  term: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(500).nullable().optional(),
});
export type GlossaryTermInput = z.infer<typeof glossaryTermInputSchema>;

export interface GlossaryTermSummary {
  id: string;
  term: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// A source string's glossary hits — returned alongside translation-memory suggestions so the
// Translations UI can flag "this text contains brand terms that should stay as-is".
export interface GlossaryMatch {
  term: string;
  index: number;
}

// ---- system/theme labels (spec section 5's "representative slice", entityType "system_label") -
//
// A fixed, small registry of storefront UI strings this phase actually wires up end to end (the
// storefront reads the resolved value for these keys; the Translations UI lets a merchant
// translate them). Every other theme-section / checkout-content string is out of scope for this
// pass (see the phase report) — but reuses the exact same Translation row shape when it's added.
export const SYSTEM_LABEL_REGISTRY: Record<string, string> = {
  "nav.shop": "Shop",
  "search.placeholder": "Search products",
  "cart.add_to_cart": "Add to cart",
  "cart.view_cart": "View cart",
  "cart.title": "Your cart",
  "account.sign_in": "Sign in",
};
export type SystemLabelKey = keyof typeof SYSTEM_LABEL_REGISTRY;

export const systemLabelUpsertSchema = z.object({
  locale: localeCodeSchema,
  value: z.string().trim().min(1).max(500),
  status: translationStatusSchema.optional(),
});
export type SystemLabelUpsertInput = z.infer<typeof systemLabelUpsertSchema>;

export interface SystemLabelEntry {
  key: string;
  sourceText: string;
  translation: TranslationEntry | null;
  memorySuggestion: string | null;
}
