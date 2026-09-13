import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

import { UnauthenticatedError } from "../errors/domain-error";
import { IS_PUBLIC_KEY } from "./public.decorator";
import { SessionService } from "./session.service";
import { MERCHANT_SESSION_COOKIE } from "./session.types";

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    const id = this.sessions.idFromCookie(cookies[MERCHANT_SESSION_COOKIE]);
    const session = id ? await this.sessions.load("merchant", id) : null;
    if (session) req.session = session;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    if (!session) throw new UnauthenticatedError();
    return true;
  }
}
