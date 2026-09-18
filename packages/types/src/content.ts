import { z } from "zod";

import { cursorPaginationQuerySchema } from "./api";

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

export const pageInputSchema = z.object({
  title: z.string().trim().min(1).max(255),
  handle: z.string().trim().min(1).max(255),
  bodyRich: z.record(z.string(), z.any()).default({}),
  seoTitle: z.string().trim().max(255).nullable().optional(),
  seoDescription: z.string().trim().max(320).nullable().optional(),
  templateSuffix: z.string().trim().max(255).nullable().optional(),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
});
export type PageInput = z.infer<typeof pageInputSchema>;

export const updatePageSchema = pageInputSchema.partial();
export type UpdatePageInput = z.infer<typeof updatePageSchema>;

export const pageListQuerySchema = cursorPaginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
});
export type PageListQuery = z.infer<typeof pageListQuerySchema>;

export interface PageSummary {
  id: string;
  title: string;
  handle: string;
  status: "draft" | "published" | "archived";
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

export const menuItemInputSchema = z.object({
  label: z.string().trim().min(1).max(255),
  url: z.string().trim().nullable().optional(),
  position: z.number().int().min(0).default(0),
  parentId: z.string().uuid().nullable().optional(),
});
export type MenuItemInput = z.infer<typeof menuItemInputSchema>;

export const menuInputSchema = z.object({
  title: z.string().trim().min(1).max(255),
  handle: z.string().trim().min(1).max(255),
  items: z.array(menuItemInputSchema).optional(),
});
export type MenuInput = z.infer<typeof menuInputSchema>;

export const updateMenuSchema = menuInputSchema.partial();
export type UpdateMenuInput = z.infer<typeof updateMenuSchema>;

export const menuListQuerySchema = cursorPaginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
});
export type MenuListQuery = z.infer<typeof menuListQuerySchema>;

export interface MenuItemSummary {
  id: string;
  label: string;
  url: string | null;
  position: number;
  children: MenuItemSummary[];
}

export interface MenuSummary {
  id: string;
  title: string;
  handle: string;
  items?: MenuItemSummary[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Redirects
// ---------------------------------------------------------------------------

export const redirectInputSchema = z.object({
  fromPath: z.string().trim().min(1).max(255),
  toPath: z.string().trim().min(1).max(255),
});
export type RedirectInput = z.infer<typeof redirectInputSchema>;

export const updateRedirectSchema = redirectInputSchema.partial();
export type UpdateRedirectInput = z.infer<typeof updateRedirectSchema>;
