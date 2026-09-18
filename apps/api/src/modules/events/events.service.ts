import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";

import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

// Transactional outbox: the event row commits with the change that caused it. The first
// consumer, NotificationsRelayService (Phase 13), polls unpublished rows and fans a handful
// of event types out to in-app notifications; a future webhook dispatcher (Phase 15) reads
// the same table.
@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async publish(
    ctx: Pick<TenantContext, "storeId" | "organizationId" | "actor">,
    type: string,
    payload: Record<string, unknown>,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await tx.domainEvent.create({
      data: {
        storeId: ctx.storeId,
        organizationId: ctx.organizationId,
        type,
        actorType: ctx.actor.type,
        actorId: ctx.actor.id,
        payload: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue,
      },
    });
  }
}
