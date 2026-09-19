import { Injectable } from "@nestjs/common";
import type { ActorType, Prisma } from "@ocean/db";
import type { AuditLogEntry, AuditLogQuery, Paginated } from "@ocean/types";

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

  private filterWhere(storeId: string, query: Pick<AuditLogQuery, "resourceType" | "from" | "to">): Prisma.AuditLogWhereInput {
    return {
      storeId,
      ...(query.resourceType ? { resourceType: query.resourceType } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
  }

  async listForStore(storeId: string, query: AuditLogQuery): Promise<Paginated<AuditLogEntry>> {
    const rows = await this.prisma.auditLog.findMany({
      where: this.filterWhere(storeId, query),
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

  async exportCsv(storeId: string, query: Pick<AuditLogQuery, "resourceType" | "from" | "to">): Promise<string> {
    const rows = await this.prisma.auditLog.findMany({
      where: this.filterWhere(storeId, query),
      orderBy: { createdAt: "desc" },
      take: 5000,
    });
    const actorIds = [...new Set(rows.map((r) => r.actorId).filter((v): v is string => !!v))];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, email: true } })
      : [];
    const emailById = new Map(actors.map((a) => [a.id, a.email]));
    const header = "Timestamp,Actor,Action,Resource type,Resource ID,IP";
    const lines = rows.map((r) =>
      [
        r.createdAt.toISOString(),
        csvField(r.actorId ? (emailById.get(r.actorId) ?? r.actorId) : r.actorType),
        csvField(r.action),
        csvField(r.resourceType),
        csvField(r.resourceId ?? ""),
        csvField(r.ip ?? ""),
      ].join(","),
    );
    return [header, ...lines].join("\n");
  }
}

function csvField(value: string): string {
  // Neutralize spreadsheet formula injection: a leading =, +, -, @ (or tab/CR) makes Excel/
  // Sheets treat the cell as a formula when the exported file is opened, not as plain text.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
