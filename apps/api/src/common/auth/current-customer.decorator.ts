import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

import { UnauthenticatedError } from "../errors/domain-error";
import type { SessionRecord } from "./session.types";

export const CurrentCustomerSession = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionRecord => {
    const session = ctx.switchToHttp().getRequest<Request>().customerSession;
    if (!session) throw new UnauthenticatedError();
    return session;
  },
);
