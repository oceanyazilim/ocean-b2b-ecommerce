import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

import { UnauthenticatedError } from "../errors/domain-error";
import type { SessionRecord } from "./session.types";

export const CurrentSession = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionRecord => {
    const session = ctx.switchToHttp().getRequest<Request>().session;
    if (!session) throw new UnauthenticatedError();
    return session;
  },
);

export const CurrentUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const session = ctx.switchToHttp().getRequest<Request>().session;
    if (!session) throw new UnauthenticatedError();
    return session.userId;
  },
);
