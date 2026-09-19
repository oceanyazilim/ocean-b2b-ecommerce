import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

import { UnauthenticatedError } from "../errors/domain-error";
import type { SessionRecord } from "./session.types";

export const CurrentPlatformSession = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionRecord => {
    const session = ctx.switchToHttp().getRequest<Request>().platformSession;
    if (!session) throw new UnauthenticatedError();
    return session;
  },
);

export const CurrentPlatformOperatorId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const session = ctx.switchToHttp().getRequest<Request>().platformSession;
    if (!session) throw new UnauthenticatedError();
    return session.userId;
  },
);
