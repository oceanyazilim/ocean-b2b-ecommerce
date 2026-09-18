import { Injectable } from "@nestjs/common";
import type { ActorType, Prisma } from "@ocean/db";
import type { AuditLogEntry, Paginated } from "@ocean/types";

import type { RequestMeta } from "../../common/http/request-meta";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

export interface AuditEvent {
  organizationId?: string | null;
  storeId?: string | null;
  actorType?: ActorType;
  actorId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  meta?: RequestMeta;
}

const json = (value: unknown): Prisma.InputJsonValue | undefined =>
  value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  // Writes may run inside a caller's transaction so the audit row commits with the change.
  async record(event: AuditEvent, tx: Prisma.TransactionClient = this.prisma): Promise<void> {
    await tx.auditLog.create({
      data: {
        organizationId: event.organizationId ?? null,
        storeId: event.storeId ?? null,
        actorType: event.actorType ?? (event.actorId ? "user" : "system"),
        actorId: event.actorId ?? null,
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId ?? null,
        before: json(event.before),
        after: json(event.after),
        metadata: json(event.metadata),
        ip: event.meta?.ip ?? null,
        userAgent: event.meta?.userAgent ?? null,
        sessionId: event.meta?.sessionId ?? null,
      },
    });
  }

  async listForStore(
    storeId: string,
    query: { cursor?: string; limit: number },
  ): Promise<Paginated<AuditLogEntry>> {
    const rows = await this.prisma.auditLog.findMany({
      where: { storeId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;

    const actorIds = [...new Set(page.map((r) => r.actorId).filter((v): v is string => !!v))];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const actorById = new Map(actors.map((a) => [a.id, a]));

    return {
      data: page.map((r) => ({
        id: r.id,
        action: r.action,
        resourceType: r.resourceType,
        resourceId: r.resourceId,
        actorType: r.actorType,
        actor: r.actorId ? (actorById.get(r.actorId) ?? null) : null,
        before: r.before,
        after: r.after,
        metadata: r.metadata,
        ip: r.ip,
        createdAt: r.createdAt.toISOString(),
      })),
      pageInfo: { hasNextPage, endCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null },
    };
  }
}
