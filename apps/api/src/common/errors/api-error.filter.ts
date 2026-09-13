import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import type { ApiError, ApiErrorBody, ApiErrorCode } from "@ocean/types";
import type { Request, Response } from "express";

import { DomainError } from "./domain-error";

const STATUS_TO_CODE: Record<number, ApiErrorCode> = {
  400: "validation_error",
  401: "unauthenticated",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  429: "rate_limited",
};

// Every non-2xx response leaves the API in the same envelope (docs/architecture/09-api-conventions.md).
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger("ApiError");

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = request.requestId ?? "unknown";

    let status = 500;
    let body: ApiErrorBody = {
      code: "internal_error",
      message: "An unexpected error occurred. The request id has been logged.",
      requestId,
    };

    if (exception instanceof DomainError) {
      status = exception.status;
      body = { code: exception.code, message: exception.message, requestId };
      if (exception.fields) body.fields = exception.fields;
      const extra = exception.extra ?? {};
      if (Array.isArray(extra["missing"])) body.missing = extra["missing"] as string[];
      if (typeof extra["retryAfterSeconds"] === "number") {
        body.retryAfterSeconds = extra["retryAfterSeconds"];
        response.setHeader("Retry-After", String(extra["retryAfterSeconds"]));
      }
      if (typeof extra["resource"] === "string") body.resource = extra["resource"];
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      const message =
        typeof res === "string"
          ? res
          : ((res as { message?: string | string[] }).message ?? exception.message);
      body = {
        code: STATUS_TO_CODE[status] ?? "internal_error",
        message: Array.isArray(message) ? message.join(", ") : message,
        requestId,
      };
    } else {
      this.logger.error(
        `Unhandled error for ${request.method} ${request.originalUrl} [${requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({ error: body } satisfies ApiError);
  }
}
