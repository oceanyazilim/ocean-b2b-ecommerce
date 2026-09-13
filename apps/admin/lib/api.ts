import type { ApiErrorBody, ApiErrorCode, ApiFieldError } from "@ocean/types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(
  /\/+$/,
  "",
);
const BASE = `${API_URL}/admin/v1`;

export class ApiClientError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly fields: ApiFieldError[];
  readonly requestId: string;
  readonly missing: string[];

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = body.code;
    this.fields = body.fields ?? [];
    this.requestId = body.requestId;
    this.missing = body.missing ?? [];
  }

  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const f of this.fields) if (!(f.path in out)) out[f.path] = f.message;
    return out;
  }
}

export interface ApiRequestInit extends Omit<RequestInit, "body"> {
  body?: unknown;
  // Server components pass the incoming cookie header through so the API sees the session.
  cookie?: string;
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

export async function api<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const { body, cookie, headers, ...rest } = init;
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    method: rest.method ?? (body === undefined ? "GET" : "POST"),
    credentials: "include",
    cache: "no-store",
    headers: {
      accept: "application/json",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
      ...(headers as Record<string, string> | undefined),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return parse<T>(res);
}

export function isApiError(error: unknown, code?: ApiErrorCode): error is ApiClientError {
  return error instanceof ApiClientError && (code === undefined || error.code === code);
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something unexpected happened. Please try again.";
}
