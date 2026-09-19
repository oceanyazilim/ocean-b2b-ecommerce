import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { SsoConnectionSummary, UpsertSsoConnectionInput } from "@ocean/types";
import type { Response } from "express";

import { SessionService } from "../../common/auth/session.service";
import { EncryptionService } from "../../common/crypto/encryption.service";
import { NotFoundError, UnauthenticatedError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import type { Env } from "../../config/env";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { PasswordService } from "../users/password.service";

function toSummary(conn: {
  domain: string;
  issuer: string;
  clientId: string;
  defaultRole: string;
  status: "active" | "disabled";
  createdAt: Date;
}, startUrl: string): SsoConnectionSummary {
  return {
    domain: conn.domain,
    issuer: conn.issuer,
    clientId: conn.clientId,
    defaultRole: conn.defaultRole,
    status: conn.status,
    startUrl,
    createdAt: conn.createdAt.toISOString(),
  };
}

@Injectable()
export class SsoService {
  private readonly stateSecret: string;
  private readonly adminUrl: string;
  private readonly apiOrigin: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly passwords: PasswordService,
    config: ConfigService<Env, true>,
  ) {
    this.stateSecret = config.get("SESSION_SECRET", { infer: true });
    this.adminUrl = config.get("ADMIN_URL", { infer: true });
    this.apiOrigin = `http://localhost:${config.get("API_PORT", { infer: true })}`;
  }

  private redirectUri(): string {
    return `${this.apiOrigin}/admin/v1/auth/sso/callback`;
  }

  private signState(organizationId: string): string {
    const nonce = randomBytes(12).toString("base64url");
    const payload = `${organizationId}.${nonce}`;
    const sig = createHmac("sha256", this.stateSecret).update(payload).digest("base64url");
    return `${payload}.${sig}`;
  }

  private verifyState(state: string): string | null {
    const parts = state.split(".");
    if (parts.length !== 3) return null;
    const organizationId = parts[0] as string;
    const nonce = parts[1] as string;
    const sig = parts[2] as string;
    const expected = createHmac("sha256", this.stateSecret).update(`${organizationId}.${nonce}`).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return organizationId;
  }

  private startUrlFor(domain: string): string {
    return `${this.apiOrigin}/admin/v1/auth/sso/${encodeURIComponent(domain)}/start`;
  }

  async getConnection(tenant: TenantContext): Promise<SsoConnectionSummary | null> {
    const conn = await this.prisma.ssoConnection.findUnique({
      where: { organizationId: tenant.organizationId },
    });
    if (!conn) return null;
    return toSummary(conn, this.startUrlFor(conn.domain));
  }

  async upsert(tenant: TenantContext, input: UpsertSsoConnectionInput): Promise<SsoConnectionSummary> {
    const conn = await this.prisma.ssoConnection.upsert({
      where: { organizationId: tenant.organizationId },
      update: {
        domain: input.domain,
        issuer: input.issuer,
        authorizationEndpoint: input.authorizationEndpoint,
        tokenEndpoint: input.tokenEndpoint,
        userinfoEndpoint: input.userinfoEndpoint,
        clientId: input.clientId,
        clientSecretEnc: this.encryption.encrypt(input.clientSecret),
        defaultRole: input.defaultRole,
        status: "active",
      },
      create: {
        organizationId: tenant.organizationId,
        domain: input.domain,
        issuer: input.issuer,
        authorizationEndpoint: input.authorizationEndpoint,
        tokenEndpoint: input.tokenEndpoint,
        userinfoEndpoint: input.userinfoEndpoint,
        clientId: input.clientId,
        clientSecretEnc: this.encryption.encrypt(input.clientSecret),
        defaultRole: input.defaultRole,
      },
    });
    return toSummary(conn, this.startUrlFor(conn.domain));
  }

  async remove(tenant: TenantContext): Promise<void> {
    await this.prisma.ssoConnection.deleteMany({ where: { organizationId: tenant.organizationId } });
  }

  // Looks the connection up by the domain segment in the start URL (not the org slug — a
  // buyer typing their company's domain, the same UX every real "sign in with SSO" box uses),
  // signs a CSRF-resistant state, and returns the IdP's own authorization URL.
  async buildAuthorizeUrl(domain: string): Promise<string> {
    const conn = await this.prisma.ssoConnection.findFirst({
      where: { domain: domain.toLowerCase(), status: "active" },
    });
    if (!conn) throw new NotFoundError("SSO connection");
    const url = new URL(conn.authorizationEndpoint);
    url.searchParams.set("client_id", conn.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("redirect_uri", this.redirectUri());
    url.searchParams.set("state", this.signState(conn.organizationId));
    return url.toString();
  }

  // The authorization-code exchange + userinfo fetch — a real OIDC relying party, just without
  // local JWKS/id_token signature verification (this codebase has no JWT library dependency;
  // calling userinfo with the access token is still genuine delegated authentication, just a
  // network round-trip instead of a local crypto check).
  async handleCallback(
    code: string,
    state: string,
    meta: RequestMeta,
    res: Response,
  ): Promise<{ redirectTo: string }> {
    const organizationId = this.verifyState(state);
    if (!organizationId) throw new UnauthenticatedError("Invalid SSO state.");
    const conn = await this.prisma.ssoConnection.findUnique({ where: { organizationId } });
    if (!conn || conn.status !== "active") throw new UnauthenticatedError("SSO is not configured.");

    const tokenRes = await fetch(conn.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: this.redirectUri(),
        client_id: conn.clientId,
        client_secret: this.encryption.decrypt(conn.clientSecretEnc),
      }),
    });
    if (!tokenRes.ok) throw new UnauthenticatedError("SSO sign-in failed.");
    const token = (await tokenRes.json()) as { access_token: string };

    const userinfoRes = await fetch(conn.userinfoEndpoint, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!userinfoRes.ok) throw new UnauthenticatedError("SSO sign-in failed.");
    const profile = (await userinfoRes.json()) as { email?: string; name?: string };
    const email = profile.email?.toLowerCase();
    if (!email || !email.endsWith(`@${conn.domain}`)) {
      throw new UnauthenticatedError(`This SSO connection only accepts @${conn.domain} accounts.`);
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { email } });
      if (existing) {
        // Critical: email is a GLOBAL unique column, not scoped to this org, and nothing here
        // verifies this org actually owns `conn.domain` (no DNS/ownership check — see the
        // SsoConnection model comment). Logging the caller in as any pre-existing user whose
        // email merely matches would let anyone with organization.write on ANY org take over
        // ANY other user's account platform-wide, just by pointing this connection's endpoints
        // at a server they control and asserting that user's email. SSO may therefore only
        // authenticate a user who is already known to THIS org — it can sign in an existing
        // member, or provision a brand-new account, but never adopt an unrelated stranger's
        // pre-existing identity.
        const alreadyMember = await tx.organizationMember.findUnique({
          where: { organizationId_userId: { organizationId, userId: existing.id } },
        });
        if (!alreadyMember) {
          throw new UnauthenticatedError(
            "This account isn't a member of this organization yet. Ask an admin to invite you first.",
          );
        }
        await tx.organizationMember.update({
          where: { organizationId_userId: { organizationId, userId: existing.id } },
          data: { status: "active" },
        });
        return existing;
      }
      const created = await tx.user.create({
        data: {
          email,
          name: profile.name ?? email,
          // SSO users authenticate through the IdP; this password is never used, but the
          // column is non-nullable, so a random one is set to keep them out of password login.
          passwordHash: await this.passwords.hash(randomBytes(32).toString("hex")),
          emailVerifiedAt: new Date(),
        },
      });
      await tx.organizationMember.create({
        data: { organizationId, userId: created.id, role: conn.defaultRole },
      });
      return created;
    });

    const session = await this.sessions.create("merchant", user.id, meta);
    this.sessions.attachCookie(res, session);
    await this.audit.record({
      organizationId,
      actorId: user.id,
      action: "user.sso_signed_in",
      resourceType: "user",
      resourceId: user.id,
      meta,
    });
    return { redirectTo: this.adminUrl };
  }
}
