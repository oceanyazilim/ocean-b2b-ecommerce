import { randomBytes, timingSafeEqual } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { isStorePermission } from "@ocean/permissions";
import type {
  CreateDeveloperAppInput,
  DeveloperAppCreated,
  DeveloperAppSummary,
  OAuthTokenInput,
  OAuthTokenResponse,
} from "@ocean/types";

import { NotFoundError, UnauthenticatedError, ValidationError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { hashToken } from "../users/user-token.service";
import { AuditService } from "../audit/audit.service";

const OAUTH_TOKEN_TTL_SECONDS = 3600;

function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function assertKnownScopes(scopes: string[]): void {
  const unknown = scopes.filter((s) => !isStorePermission(s));
  if (unknown.length) {
    throw new ValidationError(`Unknown scope(s): ${unknown.join(", ")}`, [
      { path: "scopes", message: `Unknown scope(s): ${unknown.join(", ")}` },
    ]);
  }
}

function toSummary(app: {
  id: string;
  name: string;
  clientId: string;
  scopes: string[];
  status: "active" | "revoked";
  createdAt: Date;
}): DeveloperAppSummary {
  return {
    id: app.id,
    name: app.name,
    clientId: app.clientId,
    scopes: app.scopes,
    status: app.status,
    createdAt: app.createdAt.toISOString(),
  };
}

@Injectable()
export class DeveloperAppsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(tenant: TenantContext): Promise<DeveloperAppSummary[]> {
    const apps = await this.prisma.developerApp.findMany({
      where: { storeId: tenant.storeId as string },
      orderBy: { createdAt: "desc" },
    });
    return apps.map(toSummary);
  }

  async create(
    tenant: TenantContext,
    input: CreateDeveloperAppInput,
    meta: RequestMeta,
  ): Promise<DeveloperAppCreated> {
    assertKnownScopes(input.scopes);
    const clientId = `ocean_client_${randomBytes(12).toString("hex")}`;
    const clientSecret = `ocean_cs_${randomBytes(24).toString("base64url")}`;
    const created = await this.prisma.developerApp.create({
      data: {
        storeId: tenant.storeId as string,
        organizationId: tenant.organizationId,
        name: input.name,
        clientId,
        clientSecretHash: hashToken(clientSecret),
        scopes: input.scopes,
      },
    });
    await this.audit.record({
      organizationId: tenant.organizationId,
      storeId: tenant.storeId,
      actorId: tenant.actor.id,
      action: "developer_app.created",
      resourceType: "developer_app",
      resourceId: created.id,
      after: { name: created.name, scopes: created.scopes },
      meta,
    });
    return { ...toSummary(created), clientSecret };
  }

  async revoke(tenant: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    const app = await this.prisma.developerApp.findFirst({
      where: { id, storeId: tenant.storeId as string },
    });
    if (!app) throw new NotFoundError("App");
    await this.prisma.$transaction([
      this.prisma.developerApp.update({ where: { id }, data: { status: "revoked" } }),
      this.prisma.apiKey.updateMany({
        where: { appId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.record({
      organizationId: tenant.organizationId,
      storeId: tenant.storeId,
      actorId: tenant.actor.id,
      action: "developer_app.revoked",
      resourceType: "developer_app",
      resourceId: id,
      meta,
    });
  }

  // RFC 6749 client_credentials grant — no consent screen, since the app and the authorizer
  // are the same store owner. The issued token is just another ApiKey row (kind=oauth_token).
  async issueToken(input: OAuthTokenInput): Promise<OAuthTokenResponse> {
    const app = await this.prisma.developerApp.findUnique({ where: { clientId: input.client_id } });
    if (!app || app.status !== "active" || !secretsMatch(app.clientSecretHash, hashToken(input.client_secret))) {
      throw new UnauthenticatedError("Invalid client credentials.");
    }
    const token = `ocean_at_${randomBytes(24).toString("base64url")}`;
    await this.prisma.apiKey.create({
      data: {
        storeId: app.storeId,
        organizationId: app.organizationId,
        appId: app.id,
        name: `${app.name} (OAuth token)`,
        keyHash: hashToken(token),
        scopes: app.scopes,
        kind: "oauth_token",
        expiresAt: new Date(Date.now() + OAUTH_TOKEN_TTL_SECONDS * 1000),
      },
    });
    return {
      access_token: token,
      token_type: "bearer",
      expires_in: OAUTH_TOKEN_TTL_SECONDS,
      scope: app.scopes.join(" "),
    };
  }
}

