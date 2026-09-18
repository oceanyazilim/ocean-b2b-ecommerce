import { z } from "zod";

// Theme Global
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

// Store Theme
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

// Store Theme Version
export const storeThemeVersionSchema = z.object({
  id: z.string(),
  number: z.number(),
  globalSettings: z.any(),
  status: z.string(),
  etag: z.string(),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type StoreThemeVersion = z.infer<typeof storeThemeVersionSchema>;

// Template Version
export const themeTemplateVersionSchema = z.object({
  id: z.string(),
  templateType: z.string(),
  templateName: z.string(),
  configuration: z.any(),
});
export type ThemeTemplateVersion = z.infer<typeof themeTemplateVersionSchema>;

export const createStoreThemeInputSchema = z.object({
  themeId: z.string(),
  themeReleaseId: z.string(),
  name: z.string().optional(),
});
export type CreateStoreThemeInput = z.infer<typeof createStoreThemeInputSchema>;

export const updateStoreThemeInputSchema = z.object({
  name: z.string().optional(),
  role: z.enum(["main", "unpublished"]).optional(),
});
export type UpdateStoreThemeInput = z.infer<typeof updateStoreThemeInputSchema>;

export const updateThemeTemplateInputSchema = z.object({
  configuration: z.any(),
});
export type UpdateThemeTemplateInput = z.infer<typeof updateThemeTemplateInputSchema>;
