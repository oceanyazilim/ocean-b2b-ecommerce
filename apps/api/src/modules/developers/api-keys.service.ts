import { randomBytes } from "node:crypto";

import { Injectable } from "@nestjs/common";
import type { ApiKeyCreated, ApiKeySummary, CreateApiKeyInput } from "@ocean/types";

import { NotFoundError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { hashToken } from "../users/user-token.service";
import { assertKnownScopes } from "./developer-apps.service";

function toSummary(key: {
  id: string;
  name: string;
  scopes: string[];
  kind: "static" | "oauth_token";
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}): ApiKeySummary {
  return {
    id: key.id,
    name: key.name,
    scopes: key.scopes,
    kind: key.kind,
    expiresAt: key.expiresAt?.toISOString() ?? null,
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    revokedAt: key.revokedAt?.toISOString() ?? null,
    createdAt: key.createdAt.toISOString(),
  };
}

// Statically-created keys (kind=static, appId null) — the merchant-facing "create an API key"
// flow. Keys minted by the OAuth client_credentials grant live in the same table but are
// created by DeveloperAppsService.issueToken instead.
@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(tenant: TenantContext): Promise<ApiKeySummary[]> {
    const keys = await this.prisma.apiKey.findMany({
      where: { storeId: tenant.storeId as string, kind: "static" },
      orderBy: { createdAt: "desc" },
    });
    return keys.map(toSummary);
  }

  async create(tenant: TenantContext, input: CreateApiKeyInput, meta: RequestMeta): Promise<ApiKeyCreated> {
    assertKnownScopes(input.scopes);
    const secret = `ocean_sk_${randomBytes(24).toString("base64url")}`;
    const created = await this.prisma.apiKey.create({
      data: {
        storeId: tenant.storeId as string,
        organizationId: tenant.organizationId,
        name: input.name,
        keyHash: hashToken(secret),
        scopes: input.scopes,
        kind: "static",
      },
    });
    await this.audit.record({
      organizationId: tenant.organizationId,
      storeId: tenant.storeId,
      actorId: tenant.actor.id,
      action: "api_key.created",
      resourceType: "api_key",
      resourceId: created.id,
      after: { name: created.name, scopes: created.scopes },
      meta,
    });
    return { ...toSummary(created), secret };
  }

  async revoke(tenant: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    const key = await this.prisma.apiKey.findFirst({ where: { id, storeId: tenant.storeId as string } });
    if (!key) throw new NotFoundError("API key");
    await this.prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    await this.audit.record({
      organizationId: tenant.organizationId,
      storeId: tenant.storeId,
      actorId: tenant.actor.id,
      action: "api_key.revoked",
      resourceType: "api_key",
      resourceId: id,
      meta,
    });
  }
}
