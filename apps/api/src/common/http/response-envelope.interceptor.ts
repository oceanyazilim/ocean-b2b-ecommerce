import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import type { Request } from "express";
import { map, type Observable } from "rxjs";

function isEnvelope(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "data" in value &&
    ("pageInfo" in value || Object.keys(value).length === 1)
  );
}

// Successful responses are `{ data }` or `{ data, pageInfo }`. Health endpoints stay raw
// so infrastructure probes can read them without unwrapping.
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    if (req.path.startsWith("/health")) return next.handle();
    return next
      .handle()
      .pipe(map((value) => (isEnvelope(value) ? value : { data: value ?? null })));
  }
}
