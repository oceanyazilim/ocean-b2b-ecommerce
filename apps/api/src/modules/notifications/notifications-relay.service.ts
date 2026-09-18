import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import type { Prisma } from "@ocean/db";

import { PrismaService } from "../../infrastructure/prisma/prisma.service";

interface NotificationTemplate {
  title: string;
  body: string;
}

// The small subset of the DomainEvent catalog (docs/architecture/10-events-queues-caching.md)
// that's worth interrupting a staff member for. Anything else still gets marked relayed below,
// it just has no consumer yet — the next one (Phase 15 webhooks) reads the same outbox table.
const RULES: Record<string, (payload: Record<string, unknown>) => NotificationTemplate> = {
  "order.created": (p) => ({
    title: "New order",
    body: `Order #${String(p.number ?? "")} was placed.`,
  }),
  "quote.accepted": () => ({
    title: "Quote accepted",
    body: "A buyer accepted a quote you sent.",
  }),
  "company_application.submitted": () => ({
    title: "New wholesale application",
    body: "A new company application is waiting for review.",
  }),
  "return.requested": () => ({
    title: "Return requested",
    body: "A customer requested a return on an order.",
  }),
};

const RELAY_BATCH_SIZE = 50;

// Drains the transactional outbox (`DomainEvent`, written by every write path via
// EventsService.publish) on a short in-process interval. There's no queue/worker
// infrastructure anywhere else in this codebase yet, so this intentionally stays a plain
// polling loop rather than a BullMQ consumer — real work, honest scope.
@Injectable()
export class NotificationsRelayService {
  private readonly logger = new Logger("NotificationsRelay");

  constructor(private readonly prisma: PrismaService) {}

  @Interval(5000)
  async tick(): Promise<void> {
    try {
      await this.processOnce();
    } catch (error) {
      this.logger.warn(`relay tick failed: ${String(error)}`);
    }
  }

  async processOnce(limit = RELAY_BATCH_SIZE): Promise<number> {
    const events = await this.prisma.domainEvent.findMany({
      where: { publishedAt: null },
      orderBy: { occurredAt: "asc" },
      take: limit,
    });
    for (const event of events) {
      await this.prisma.$transaction(async (tx) => {
        const rule = RULES[event.type];
        if (rule && event.storeId) {
          const template = rule(event.payload as Record<string, unknown>);
          const members = await tx.storeMember.findMany({
            where: { storeId: event.storeId, status: "active" },
            select: { userId: true, organizationId: true },
          });
          if (members.length) {
            await tx.notification.createMany({
              data: members.map((m) => ({
                storeId: event.storeId as string,
                organizationId: m.organizationId,
                userId: m.userId,
                type: event.type,
                title: template.title,
                body: template.body,
                data: event.payload as Prisma.InputJsonValue,
              })),
            });
          }
        }
        await tx.domainEvent.update({ where: { id: event.id }, data: { publishedAt: new Date() } });
      });
    }
    return events.length;
  }
}
