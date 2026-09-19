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
// Blogs
// ---------------------------------------------------------------------------

export const blogInputSchema = z.object({
  title: z.string().trim().min(1).max(255),
  handle: z.string().trim().min(1).max(255),
  seoTitle: z.string().trim().max(255).nullable().optional(),
  seoDescription: z.string().trim().max(320).nullable().optional(),
});
export type BlogInput = z.infer<typeof blogInputSchema>;

export const updateBlogSchema = blogInputSchema.partial();
export type UpdateBlogInput = z.infer<typeof updateBlogSchema>;

export interface BlogSummary {
  id: string;
  title: string;
  handle: string;
  articleCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BlogDetail extends BlogSummary {
  seoTitle: string | null;
  seoDescription: string | null;
}

// ---------------------------------------------------------------------------
// Articles (blog-scoped)
// ---------------------------------------------------------------------------

export const articleInputSchema = z.object({
  title: z.string().trim().min(1).max(255),
  handle: z.string().trim().min(1).max(255),
  bodyRich: z.record(z.string(), z.any()).default({}),
  excerpt: z.string().trim().max(500).nullable().optional(),
  authorName: z.string().trim().max(255).nullable().optional(),
  featuredImageUrl: z.string().trim().max(2048).nullable().optional(),
  featuredImageAlt: z.string().trim().max(255).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
  seoTitle: z.string().trim().max(255).nullable().optional(),
  seoDescription: z.string().trim().max(320).nullable().optional(),
  templateSuffix: z.string().trim().max(255).nullable().optional(),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
});
export type ArticleInput = z.infer<typeof articleInputSchema>;

export const updateArticleSchema = articleInputSchema.partial();
export type UpdateArticleInput = z.infer<typeof updateArticleSchema>;

export interface ArticleSummary {
  id: string;
  blogId: string;
  title: string;
  handle: string;
  excerpt: string | null;
  authorName: string | null;
  featuredImageUrl: string | null;
  featuredImageAlt: string | null;
  tags: string[];
  status: "draft" | "published" | "archived";
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ArticleDetail extends ArticleSummary {
  bodyRich: { html?: string } | null;
  seoTitle: string | null;
  seoDescription: string | null;
}

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

export const menuItemLinkTypes = ["url", "product", "collection", "page"] as const;
export const menuItemLinkTypeSchema = z.enum(menuItemLinkTypes);
export type MenuItemLinkType = z.infer<typeof menuItemLinkTypeSchema>;

export const menuItemInputSchema = z.object({
  // Client-assigned id, unique within a single save request. A save always replaces the whole
  // item list (items have no stable identity from the client's perspective — same pattern as a
  // theme template's configuration), so `tempId` / `parentId` below are used purely to wire up
  // parent-child relationships within *this* request; the server assigns real ids on write.
  // Optional: a caller building parent/child structure (e.g. mega-menu columns) supplies one to
  // reference from a child's `parentId` in the same request; a flat item list can omit it.
  tempId: z.string().trim().min(1).max(64).optional(),
  label: z.string().trim().min(1).max(255),
  url: z.string().trim().nullable().optional(),
  position: z.number().int().min(0).default(0),
  // References another item's `tempId` in the same request, or null for a top-level item.
  parentId: z.string().trim().max(64).nullable().optional(),
  // Link-target metadata: set when the link was chosen via a resource picker instead of typed
  // as a raw URL. `url` must still be populated with the resolved href.
  linkType: menuItemLinkTypeSchema.nullable().optional(),
  resourceId: z.string().uuid().nullable().optional(),
  // Mega menu: meaningful on top-level items only. When enabled, this item's children are
  // rendered as columns (heading + links) instead of a flat flyout list.
  megaMenuEnabled: z.boolean().optional().default(false),
  promoImageUrl: z.string().trim().max(2048).nullable().optional(),
  promoImageAlt: z.string().trim().max(255).nullable().optional(),
  promoLinkLabel: z.string().trim().max(255).nullable().optional(),
  promoLinkUrl: z.string().trim().max(2048).nullable().optional(),
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
  linkType: MenuItemLinkType | null;
  resourceId: string | null;
  megaMenuEnabled: boolean;
  promoImageUrl: string | null;
  promoImageAlt: string | null;
  promoLinkLabel: string | null;
  promoLinkUrl: string | null;
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
