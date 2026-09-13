import { z } from "zod";

import { cursorPaginationQuerySchema } from "./api";

export const MEDIA_KINDS = ["image", "video", "document"] as const;
export const mediaKindSchema = z.enum(MEDIA_KINDS);
export type MediaKind = z.infer<typeof mediaKindSchema>;

export const MEDIA_MAX_BYTES = 20 * 1024 * 1024;

export const mediaListQuerySchema = cursorPaginationQuerySchema.extend({
  kind: mediaKindSchema.optional(),
  q: z.string().trim().max(120).optional(),
});
export type MediaListQuery = z.infer<typeof mediaListQuerySchema>;

export const updateMediaSchema = z.object({
  alt: z.string().trim().max(255).nullable(),
});
export type UpdateMediaInput = z.infer<typeof updateMediaSchema>;

export interface MediaSummary {
  id: string;
  kind: MediaKind;
  url: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  alt: string | null;
  originalFilename: string;
  usageCount: number;
  createdAt: string;
}
