import "server-only";

import type { ApiErrorBody, ApiErrorCode, ApiFieldError } from "@ocean/types";
import { cookies, headers } from "next/headers";

// Server-side calls straight to the API, with the incoming request's own Host header
// forwarded — StorefrontGuard resolves the tenant from that Host, not from any store id we'd
// otherwise have to thread through every call. This only fits read-only endpoints: it can't
// relay a Set-Cookie back to the browser (Next.js forbids that outside a Server Action / Route
// Handler), so cart/auth mutations go through app/api/storefront/[...path]/route.ts instead.
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");
const BASE = `${API_URL}/storefront/v1`;

export class ApiClientError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly fields: ApiFieldError[];
  readonly requestId: string;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = body.code;
    this.fields = body.fields ?? [];
    this.requestId = body.requestId;
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const body = (json as { error?: ApiErrorBody } | null)?.error ?? {
      code: "internal_error" as const,
      message: `Request failed with status ${res.status}`,
      requestId: res.headers.get("x-request-id") ?? "unknown",
    };
    throw new ApiClientError(res.status, body);
  }
  return json as T;
}

export async function storefrontHost(): Promise<string> {
  const h = await headers();
  return h.get("host") ?? "";
}

export async function storefrontFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const host = await storefrontHost();
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      accept: "application/json",
      // Node's fetch ignores an explicit `Host` header override — see storefront.guard.ts.
      "x-forwarded-host": host,
      cookie: cookieHeader,
      ...init.headers,
    },
  });
  return parse<T>(res);
}

export function isApiError(error: unknown, code?: ApiErrorCode): error is ApiClientError {
  return error instanceof ApiClientError && (code === undefined || error.code === code);
}
