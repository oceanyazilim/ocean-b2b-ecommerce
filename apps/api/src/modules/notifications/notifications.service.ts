import { Injectable } from "@nestjs/common";
import type { NotificationListQuery, NotificationSummary, Paginated } from "@ocean/types";

import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  private scope(ctx: TenantContext) {
    return { storeId: ctx.storeId as string, userId: ctx.actor.id };
  }

  async list(ctx: TenantContext, query: NotificationListQuery): Promise<Paginated<NotificationSummary>> {
    const rows = await this.prisma.notification.findMany({
      where: { ...this.scope(ctx), ...(query.unreadOnly ? { readAt: null } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    return {
      data: page.map(toSummary),
      pageInfo: { hasNextPage, endCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null },
    };
  }

  unreadCount(ctx: TenantContext): Promise<number> {
    return this.prisma.notification.count({ where: { ...this.scope(ctx), readAt: null } });
  }

  async markRead(ctx: TenantContext, id: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { ...this.scope(ctx), id },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(ctx: TenantContext): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { ...this.scope(ctx), readAt: null },
      data: { readAt: new Date() },
    });
  }
}

function toSummary(row: {
  id: string;
  type: string;
  title: string;
  body: string;
  data: unknown;
  readAt: Date | null;
  createdAt: Date;
}): NotificationSummary {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    data: (row.data as Record<string, unknown> | null) ?? null,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
