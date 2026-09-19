import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";

import { UnauthenticatedError } from "../errors/domain-error";
import { SessionService } from "./session.service";
import { PLATFORM_SESSION_COOKIE } from "./session.types";

// Gates every route under the platform/* surface (apps/platform-admin only). Deliberately its
// own guard, not a mode of SessionGuard: it reads a different cookie (PLATFORM_SESSION_COOKIE)
// into a different session realm ("platform"), so a merchant session cookie is structurally
// incapable of satisfying it — there is no shared code path a bug here could leak into the
// merchant-facing admin/v1 surface, or vice versa. Every controller this guards must also carry
// @Public() so the global merchant SessionGuard doesn't reject the request first (see
// storefront-api's StorefrontGuard for the same pattern).
@Injectable()
export class PlatformSessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    const id = this.sessions.idFromCookie(cookies[PLATFORM_SESSION_COOKIE]);
    const session = id ? await this.sessions.load("platform", id) : null;
    if (!session) throw new UnauthenticatedError();
    req.platformSession = session;
    return true;
  }
}
