import { Injectable } from "@nestjs/common";
import type { ImpersonationSessionSummary, StartImpersonationInput } from "@ocean/types";
import type { Response } from "express";

import { SessionService } from "../../common/auth/session.service";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

const IMPERSONATION_TTL_MS = 30 * 60 * 1000;

// Support-initiated "view as": a store owner/admin can temporarily browse as one of their own
// members to reproduce what that member sees. There's no separate platform-operator role or
// app in this codebase (see the Phase 15 developer-platform note on the same gap), so this
// stays scoped to a store's own team rather than cross-tenant platform support.
@Injectable()
export class ImpersonationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async start(
    tenant: TenantContext,
    input: StartImpersonationInput,
    meta: RequestMeta,
    res: Response,
  ): Promise<ImpersonationSessionSummary> {
    if (input.userId === tenant.actor.id) {
      throw new ForbiddenError("You cannot impersonate yourself.");
    }
    const target = await this.prisma.storeMember.findFirst({
      where: { storeId: tenant.storeId as string, userId: input.userId, status: "active" },
      include: { user: true },
    });
    if (!target) throw new NotFoundError("Store member");

    // hardExpiresAt makes this a real, activity-proof deadline — not just something the banner
    // hides at, the underlying Redis session record itself stops validating after this instant.
    const hardExpiresAt = Date.now() + IMPERSONATION_TTL_MS;
    const session = await this.sessions.create("merchant", target.userId, meta, { hardExpiresAt });
    const record = await this.prisma.impersonationSession.create({
      data: {
        storeId: tenant.storeId as string,
        organizationId: tenant.organizationId,
        impersonatorUserId: tenant.actor.id,
        targetUserId: target.userId,
        reason: input.reason,
        sessionId: session.id,
        expiresAt: new Date(hardExpiresAt),
      },
    });
    this.sessions.attachCookie(res, session);
    await this.audit.record({
      organizationId: tenant.organizationId,
      storeId: tenant.storeId,
      actorId: tenant.actor.id,
      action: "support.impersonation_started",
      resourceType: "impersonation_session",
      resourceId: record.id,
      after: { targetUserId: target.userId, reason: input.reason },
      meta,
    });
    return {
      id: record.id,
      targetUserId: target.userId,
      targetName: target.user.name,
      targetEmail: target.user.email,
      reason: record.reason,
      expiresAt: record.expiresAt.toISOString(),
      endedAt: null,
      createdAt: record.createdAt.toISOString(),
    };
  }

  // Only reachable while the browser is holding the impersonated session's own cookie — its
  // permissions may well be lower than what started the impersonation, so this never gates on
  // a specific store permission, only on "is there an active row for this exact session".
  async end(meta: RequestMeta, res: Response): Promise<void> {
    if (!meta.sessionId) throw new UnauthenticatedError();
    const record = await this.prisma.impersonationSession.findFirst({
      where: { sessionId: meta.sessionId, endedAt: null },
    });
    if (!record) throw new NotFoundError("Impersonation session");
    await this.prisma.impersonationSession.update({
      where: { id: record.id },
      data: { endedAt: new Date() },
    });
    await this.sessions.revoke("merchant", record.sessionId, record.targetUserId);
    const restored = await this.sessions.create("merchant", record.impersonatorUserId, meta);
    this.sessions.attachCookie(res, restored);
    await this.audit.record({
      organizationId: record.organizationId,
      storeId: record.storeId,
      actorId: record.impersonatorUserId,
      action: "support.impersonation_ended",
      resourceType: "impersonation_session",
      resourceId: record.id,
      meta,
    });
  }

  async listForStore(tenant: TenantContext): Promise<ImpersonationSessionSummary[]> {
    const rows = await this.prisma.impersonationSession.findMany({
      where: { storeId: tenant.storeId as string },
      include: { target: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return rows.map((r) => ({
      id: r.id,
      targetUserId: r.targetUserId,
      targetName: r.target.name,
      targetEmail: r.target.email,
      reason: r.reason,
      expiresAt: r.expiresAt.toISOString(),
      endedAt: r.endedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // Whether the CURRENT session is itself an active impersonation — the admin UI uses this to
  // decide whether to show the "you're viewing as X" banner.
  async currentStatus(meta: RequestMeta): Promise<ImpersonationSessionSummary | null> {
    if (!meta.sessionId) return null;
    const record = await this.prisma.impersonationSession.findFirst({
      where: { sessionId: meta.sessionId, endedAt: null, expiresAt: { gt: new Date() } },
      include: { target: true },
    });
    if (!record) return null;
    return {
      id: record.id,
      targetUserId: record.targetUserId,
      targetName: record.target.name,
      targetEmail: record.target.email,
      reason: record.reason,
      expiresAt: record.expiresAt.toISOString(),
      endedAt: null,
      createdAt: record.createdAt.toISOString(),
    };
  }
}
