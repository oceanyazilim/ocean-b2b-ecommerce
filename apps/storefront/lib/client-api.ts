"use client";

import type { ApiErrorBody, ApiErrorCode, ApiFieldError } from "@ocean/types";

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

  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const f of this.fields) if (!(f.path in out)) out[f.path] = f.message;
    return out;
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

// Client components call the storefront's own Route Handler proxy (same-origin, so cookies
// travel naturally) instead of the API directly — see app/api/storefront/[...path]/route.ts.
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const res = await fetch(`/api/storefront${path}`, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    credentials: "include",
    cache: "no-store",
    headers: {
      accept: "application/json",
      ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  return parse<T>(res);
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something unexpected happened. Please try again.";
}
