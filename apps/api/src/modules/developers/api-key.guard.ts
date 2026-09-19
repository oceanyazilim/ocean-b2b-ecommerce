import { CanActivate, createParamDecorator, ExecutionContext, Injectable, Logger, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

import { ForbiddenError, UnauthenticatedError } from "../../common/errors/domain-error";
import { hashToken } from "../users/user-token.service";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

export const REQUIRE_SCOPE_KEY = "ocean:apiKeyScope";
export const RequireScope = (scope: string) => SetMetadata(REQUIRE_SCOPE_KEY, scope);

export interface ApiKeyPrincipal {
  apiKeyId: string;
  storeId: string;
  organizationId: string;
  scopes: string[];
}

// Bearer-token auth for the Developer API (/api/2026-01), a separate mechanism from the
// merchant-session SessionGuard used everywhere else — API keys and OAuth-issued tokens are
// both rows in the same ApiKey table (see schema.prisma), verified the same way here.
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger("ApiKeyGuard");

  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
    if (!token) throw new UnauthenticatedError("Missing bearer token.");

    const key = await this.prisma.apiKey.findUnique({ where: { keyHash: hashToken(token) } });
    if (!key || key.revokedAt || (key.expiresAt && key.expiresAt.getTime() < Date.now())) {
      throw new UnauthenticatedError("Invalid or expired API key.");
    }

    const requiredScope = this.reflector.getAllAndOverride<string | undefined>(REQUIRE_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredScope && !key.scopes.includes(requiredScope)) {
      throw new ForbiddenError(`This API key does not have the "${requiredScope}" scope.`, [requiredScope]);
    }

    req.apiKey = {
      apiKeyId: key.id,
      storeId: key.storeId,
      organizationId: key.organizationId,
      scopes: key.scopes,
    };
    this.prisma.apiKey
      .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
      .catch((error: unknown) => this.logger.warn(`failed to record lastUsedAt: ${String(error)}`));
    return true;
  }
}

export const CurrentApiKey = createParamDecorator((_: unknown, ctx: ExecutionContext): ApiKeyPrincipal => {
  const req = ctx.switchToHttp().getRequest<Request>();
  if (!req.apiKey) throw new UnauthenticatedError();
  return req.apiKey;
});
