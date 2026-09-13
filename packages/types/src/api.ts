import { z } from "zod";

// Cursor pagination is the default for list endpoints (see docs/architecture/09-api-conventions.md).
export const cursorPaginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(250).default(50),
});
export type CursorPaginationQuery = z.infer<typeof cursorPaginationQuerySchema>;

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface Paginated<T> {
  data: T[];
  pageInfo: PageInfo;
}

// Every non-2xx response from any Ocean API uses exactly this envelope.
export const apiErrorCodeSchema = z.enum([
  "validation_error",
  "unauthenticated",
  "forbidden",
  "not_found",
  "conflict",
  "rate_limited",
  "idempotency_conflict",
  "tenant_context_missing",
  "internal_error",
]);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export interface ApiFieldError {
  path: string;
  message: string;
}

export interface ApiError {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
    fields?: ApiFieldError[];
  };
}
