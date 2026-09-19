import { createHmac } from "node:crypto";

import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import type { Webhook } from "@ocean/db";

import { EncryptionService } from "../../common/crypto/encryption.service";
import { assertPublicHttpUrl } from "../../common/http/ssrf-guard";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

const API_VERSION = "2026-01";
const MAX_ATTEMPTS = 5;
const RELAY_BATCH_SIZE = 50;
const REQUEST_TIMEOUT_MS = 10_000;

// Drains the same DomainEvent outbox NotificationsRelayService (Phase 13) reads, but through
// its own webhookRelayedAt cursor — see the comment on that column in schema.prisma for why a
// second consumer can't reuse publishedAt. A DomainEvent is only marked webhook-relayed once
// every matching webhook has either succeeded or exhausted its retries; until then it's picked
// back up on the next tick, which is what gives this exponential backoff without a real queue.
@Injectable()
export class WebhookDispatchService {
  private readonly logger = new Logger("WebhookDispatch");

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  @Interval(5000)
  async tick(): Promise<void> {
    try {
      await this.processOnce();
    } catch (error) {
      this.logger.warn(`dispatch tick failed: ${String(error)}`);
    }
  }

  async processOnce(limit = RELAY_BATCH_SIZE): Promise<number> {
    const events = await this.prisma.domainEvent.findMany({
      where: { webhookRelayedAt: null },
      orderBy: { occurredAt: "asc" },
      take: limit,
    });
    for (const event of events) {
      const hooks = event.storeId
        ? await this.prisma.webhook.findMany({
            where: { storeId: event.storeId, topic: event.type, status: "active" },
          })
        : [];
      let allSettled = true;
      for (const hook of hooks) {
        const settled = await this.deliverIfDue(hook, event.id, {
          id: event.id,
          topic: event.type,
          storeId: event.storeId,
          occurredAt: event.occurredAt,
          payload: event.payload,
        });
        if (!settled) allSettled = false;
      }
      if (allSettled) {
        await this.prisma.domainEvent.update({
          where: { id: event.id },
          data: { webhookRelayedAt: new Date() },
        });
      }
    }
    return events.length;
  }

  // Returns true once this webhook is "done" with this event — delivered, or given up after
  // MAX_ATTEMPTS — and false if it's still owed a retry (either due now, or scheduled later).
  private async deliverIfDue(
    hook: Webhook,
    eventId: string,
    event: { id: string; topic: string; storeId: string | null; occurredAt: Date; payload: unknown },
  ): Promise<boolean> {
    const last = await this.prisma.webhookDelivery.findFirst({
      where: { webhookId: hook.id, eventId },
      orderBy: { attempt: "desc" },
    });
    if (last?.status === "delivered") return true;
    if (last?.nextRetryAt && last.nextRetryAt.getTime() > Date.now()) return false;

    const attempt = (last?.attempt ?? 0) + 1;
    const body = JSON.stringify({
      id: event.id,
      topic: event.topic,
      storeId: event.storeId,
      occurredAt: event.occurredAt.toISOString(),
      apiVersion: API_VERSION,
      data: event.payload,
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const secret = this.encryption.decrypt(hook.secretEnc);
    const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

    let responseCode: number | null = null;
    let delivered = false;
    try {
      // Re-checked at delivery time, not just at creation: a hostname's DNS could have been
      // repointed at a private address since the webhook was created (rebinding), and this is
      // the call that actually reaches the network.
      await assertPublicHttpUrl(hook.url);
      const res = await fetch(hook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Ocean-Signature": signature,
          "X-Ocean-Timestamp": timestamp,
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      responseCode = res.status;
      delivered = res.ok;
    } catch {
      responseCode = null;
    }

    if (delivered) {
      await this.prisma.webhookDelivery.create({
        data: { webhookId: hook.id, eventId, attempt, status: "delivered", responseCode, deliveredAt: new Date() },
      });
      return true;
    }

    const giveUp = attempt >= MAX_ATTEMPTS;
    const backoffMs = Math.min(2 ** attempt * 1000, 5 * 60 * 1000);
    await this.prisma.webhookDelivery.create({
      data: {
        webhookId: hook.id,
        eventId,
        attempt,
        status: "failed",
        responseCode,
        nextRetryAt: giveUp ? null : new Date(Date.now() + backoffMs),
      },
    });
    return giveUp;
  }
}
