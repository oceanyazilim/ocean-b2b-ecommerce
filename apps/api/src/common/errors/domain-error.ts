import type { ApiErrorCode, ApiFieldError } from "@ocean/types";

export class DomainError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly status: number,
    message: string,
    readonly fields?: ApiFieldError[],
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, fields?: ApiFieldError[]) {
    super("validation_error", 400, message, fields);
  }
}

export class UnauthenticatedError extends DomainError {
  constructor(message = "You need to sign in to continue.") {
    super("unauthenticated", 401, message);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "You do not have permission to do this.", missing?: string[]) {
    super("forbidden", 403, message, undefined, missing ? { missing } : undefined);
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string, message?: string) {
    super("not_found", 404, message ?? `${resource} was not found.`, undefined, { resource });
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, fields?: ApiFieldError[]) {
    super("conflict", 409, message, fields);
  }
}

export class RateLimitedError extends DomainError {
  constructor(retryAfterSeconds: number) {
    super(
      "rate_limited",
      429,
      `Too many attempts. Try again in ${retryAfterSeconds} seconds.`,
      undefined,
      { retryAfterSeconds },
    );
  }
}
