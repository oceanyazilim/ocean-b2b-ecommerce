import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
  sessionId: string | null;
  requestId: string;
}

export function requestMetaFrom(req: Request): RequestMeta {
  return {
    ip: req.ip ?? null,
    userAgent: req.header("user-agent") ?? null,
    sessionId: req.session?.id ?? req.platformSession?.id ?? req.customerSession?.id ?? null,
    requestId: req.requestId,
  };
}

export const ReqMeta = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestMeta => {
    return requestMetaFrom(ctx.switchToHttp().getRequest<Request>());
  },
);
