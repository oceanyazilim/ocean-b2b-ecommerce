import { z } from "zod";

import { idSchema } from "./primitives";

// ---- manifest (what a theme release declares it supports) ------------------------------------

export const SETTING_FIELD_TYPES = [
  "text",
  "richtext",
  "number",
  "boolean",
  "color",
  "select",
  "image",
  "url",
] as const;
export const settingFieldTypeSchema = z.enum(SETTING_FIELD_TYPES);
export type SettingFieldType = z.infer<typeof settingFieldTypeSchema>;

export const settingFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: settingFieldTypeSchema,
  default: z.unknown().optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
});
export type SettingField = z.infer<typeof settingFieldSchema>;

export const themeBlockManifestSchema = z.object({
  type: z.string().min(1),
  label: z.string().min(1),
  settings: z.array(settingFieldSchema).default([]),
});
export type ThemeBlockManifest = z.infer<typeof themeBlockManifestSchema>;

export const themeSectionManifestSchema = z.object({
  type: z.string().min(1),
  label: z.string().min(1),
  settings: z.array(settingFieldSchema).default([]),
  blocks: z.array(z.string()).default([]), // allowed block types, [] = none allowed
});
export type ThemeSectionManifest = z.infer<typeof themeSectionManifestSchema>;

export const themeTemplateManifestSchema = z.object({
  type: z.string().min(1), // e.g. "product", "collection", "home", "cart", "page"
  label: z.string().min(1),
  sections: z.array(z.string()).default([]), // allowed section types, [] = any
});
export type ThemeTemplateManifest = z.infer<typeof themeTemplateManifestSchema>;

export const themeManifestSchema = z.object({
  templates: z.array(themeTemplateManifestSchema),
  sections: z.array(themeSectionManifestSchema),
  blocks: z.array(themeBlockManifestSchema),
  globalSettings: z.array(settingFieldSchema).default([]),
});
export type ThemeManifest = z.infer<typeof themeManifestSchema>;

// ---- template configuration (what an installed template actually contains) -------------------

export const themeBlockInstanceSchema = z.object({
  type: z.string().min(1),
  settings: z.record(z.string(), z.unknown()).default({}),
});
export type ThemeBlockInstance = z.infer<typeof themeBlockInstanceSchema>;

export const themeSectionInstanceSchema = z.object({
  type: z.string().min(1),
  settings: z.record(z.string(), z.unknown()).default({}),
  blocks: z.record(z.string(), themeBlockInstanceSchema).default({}),
  blockOrder: z.array(z.string()).default([]),
});
export type ThemeSectionInstance = z.infer<typeof themeSectionInstanceSchema>;

export const templateConfigurationSchema = z.object({
  sections: z.record(z.string(), themeSectionInstanceSchema).default({}),
  sectionOrder: z.array(z.string()).default([]),
});
export type TemplateConfiguration = z.infer<typeof templateConfigurationSchema>;

// ---- global theme catalog ----------------------------------------------------------------------

export const themeSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  category: z.string().nullable(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ThemeSummary = z.infer<typeof themeSummarySchema>;

export interface ThemeReleaseSummary {
  id: string;
  version: string;
  manifest: ThemeManifest;
  releasedAt: string;
}

export interface ThemeCatalogEntry extends ThemeSummary {
  latestRelease: ThemeReleaseSummary | null;
}

// ---- store theme (an installation) --------------------------------------------------------

export const storeThemeSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  publishedVersionId: z.string().nullable(),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type StoreThemeSummary = z.infer<typeof storeThemeSummarySchema>;

export interface StoreThemeDetail extends StoreThemeSummary {
  themeId: string;
  themeName: string;
  releaseId: string;
  manifest: ThemeManifest;
  versions: { id: string; number: number; status: string; publishedAt: string | null }[];
}

export const installThemeInputSchema = z.object({
  themeId: idSchema,
  releaseId: idSchema.optional(),
  name: z.string().trim().max(255).optional(),
});
export type InstallThemeInput = z.infer<typeof installThemeInputSchema>;

export const updateStoreThemeInputSchema = z.object({
  name: z.string().trim().max(255).optional(),
});
export type UpdateStoreThemeInput = z.infer<typeof updateStoreThemeInputSchema>;

// ---- store theme version (draft / published working copy) -----------------------------------

export const themeTemplateVersionSchema = z.object({
  id: z.string(),
  templateType: z.string(),
  templateName: z.string(),
  configuration: templateConfigurationSchema,
});
export type ThemeTemplateVersion = z.infer<typeof themeTemplateVersionSchema>;

export const storeThemeVersionSchema = z.object({
  id: z.string(),
  number: z.number(),
  globalSettings: z.record(z.string(), z.unknown()),
  status: z.string(),
  etag: z.string(),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type StoreThemeVersion = z.infer<typeof storeThemeVersionSchema>;

export interface StoreThemeVersionDetail extends StoreThemeVersion {
  templates: ThemeTemplateVersion[];
}

export const updateGlobalSettingsSchema = z.object({
  globalSettings: z.record(z.string(), z.unknown()),
});
export type UpdateGlobalSettingsInput = z.infer<typeof updateGlobalSettingsSchema>;

export const updateThemeTemplateInputSchema = z.object({
  configuration: templateConfigurationSchema,
});
export type UpdateThemeTemplateInput = z.infer<typeof updateThemeTemplateInputSchema>;

// ---- resolved (storefront-facing) ------------------------------------------------------------

export interface ResolvedTheme {
  storeThemeId: string;
  versionId: string;
  globalSettings: Record<string, unknown>;
  templates: Record<string, TemplateConfiguration>; // keyed by `${templateType}.${templateName}`
}
