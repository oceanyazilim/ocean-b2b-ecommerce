import { randomBytes } from "node:crypto";

import { Injectable } from "@nestjs/common";
import type { CreateWebhookInput, WebhookCreated, WebhookDeliverySummary, WebhookSummary } from "@ocean/types";

import { EncryptionService } from "../../common/crypto/encryption.service";
import { NotFoundError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

function toSummary(hook: {
  id: string;
  topic: string;
  url: string;
  status: "active" | "disabled";
  createdAt: Date;
}): WebhookSummary {
  return { id: hook.id, topic: hook.topic, url: hook.url, status: hook.status, createdAt: hook.createdAt.toISOString() };
}

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly encryption: EncryptionService,
  ) {}

  async list(tenant: TenantContext): Promise<WebhookSummary[]> {
    const hooks = await this.prisma.webhook.findMany({
      where: { storeId: tenant.storeId as string },
      orderBy: { createdAt: "desc" },
    });
    return hooks.map(toSummary);
  }

  async create(tenant: TenantContext, input: CreateWebhookInput, meta: RequestMeta): Promise<WebhookCreated> {
    const secret = `whsec_${randomBytes(24).toString("base64url")}`;
    const created = await this.prisma.webhook.create({
      data: {
        storeId: tenant.storeId as string,
        organizationId: tenant.organizationId,
        topic: input.topic,
        url: input.url,
        secretEnc: this.encryption.encrypt(secret),
      },
    });
    await this.audit.record({
      organizationId: tenant.organizationId,
      storeId: tenant.storeId,
      actorId: tenant.actor.id,
      action: "webhook.created",
      resourceType: "webhook",
      resourceId: created.id,
      after: { topic: created.topic, url: created.url },
      meta,
    });
    return { ...toSummary(created), secret };
  }

  async remove(tenant: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    const hook = await this.prisma.webhook.findFirst({ where: { id, storeId: tenant.storeId as string } });
    if (!hook) throw new NotFoundError("Webhook");
    await this.prisma.webhook.delete({ where: { id } });
    await this.audit.record({
      organizationId: tenant.organizationId,
      storeId: tenant.storeId,
      actorId: tenant.actor.id,
      action: "webhook.deleted",
      resourceType: "webhook",
      resourceId: id,
      meta,
    });
  }

  async listDeliveries(tenant: TenantContext, webhookId: string): Promise<WebhookDeliverySummary[]> {
    const hook = await this.prisma.webhook.findFirst({
      where: { id: webhookId, storeId: tenant.storeId as string },
    });
    if (!hook) throw new NotFoundError("Webhook");
    const rows = await this.prisma.webhookDelivery.findMany({
      where: { webhookId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return rows.map((r) => ({
      id: r.id,
      eventId: r.eventId,
      attempt: r.attempt,
      status: r.status,
      responseCode: r.responseCode,
      deliveredAt: r.deliveredAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
