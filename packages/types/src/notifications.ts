import { z } from "zod";

import { cursorPaginationQuerySchema } from "./api";

export const notificationListQuerySchema = cursorPaginationQuerySchema.extend({
  unreadOnly: z.coerce.boolean().default(false),
});
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

export interface NotificationSummary {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}
