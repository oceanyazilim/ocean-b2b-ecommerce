import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

import { ForbiddenError, UnauthenticatedError } from "../errors/domain-error";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { PLATFORM_ROLE_KEY, PLATFORM_ROLE_RANK } from "./require-platform-role.decorator";

// Gates the mutating platform/* routes (feature-flag create/update/target, at present) behind a
// real PlatformOperatorRole, not just "is an active operator" — PlatformSessionGuard alone only
// proves the caller authenticated as *some* operator. Must run after PlatformSessionGuard, whose
// req.platformSession this trusts.
//
// Deliberately re-reads the operator from the DB on every request rather than trusting a role
// cached in the session: a role (or a suspension) change should take effect on an operator's very
// next request, not wait for their session to expire and get re-issued.
@Injectable()
export class PlatformRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string | undefined>(PLATFORM_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const session = req.platformSession;
    if (!session) throw new UnauthenticatedError();

    const operator = await this.prisma.platformOperator.findUnique({
      where: { id: session.userId },
      select: { role: true, status: true },
    });
    if (!operator || operator.status !== "active") throw new UnauthenticatedError();

    if (PLATFORM_ROLE_RANK[operator.role] < PLATFORM_ROLE_RANK[required as keyof typeof PLATFORM_ROLE_RANK]) {
      throw new ForbiddenError("You do not have permission to do this.");
    }
    return true;
  }
}
