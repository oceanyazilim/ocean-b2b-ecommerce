import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type { DomainInput, DomainSummary, UpdateDomainInput } from "@ocean/types";
import crypto from "crypto";

import { ConflictError, NotFoundError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { EventsService } from "../events/events.service";

type DomainRow = Prisma.DomainGetPayload<Record<string, never>>;

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";

@Injectable()
export class DomainsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  private scope(ctx: TenantContext): Prisma.DomainWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId };
  }

  private toSummary(row: DomainRow): DomainSummary {
    return {
      id: row.id,
      hostname: row.hostname,
      type: row.type,
      status: row.status,
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      sslStatus: row.sslStatus,
      isPrimary: row.isPrimary,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async list(ctx: TenantContext): Promise<DomainSummary[]> {
    const rows = await this.prisma.domain.findMany({
      where: this.scope(ctx),
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => this.toSummary(r));
  }

  async get(ctx: TenantContext, id: string): Promise<DomainSummary> {
    const row = await this.prisma.domain.findFirst({
      where: { ...this.scope(ctx), id },
    });
    if (!row) throw new NotFoundError("Domain");
    return this.toSummary(row);
  }

  async create(ctx: TenantContext, input: DomainInput, meta: RequestMeta): Promise<DomainSummary> {
    const verificationToken = crypto.randomBytes(32).toString("hex");

    const created = await this.prisma.domain
      .create({
        data: {
          storeId: ctx.storeId as string,
          organizationId: ctx.organizationId,
          hostname: input.hostname,
          type: input.type,
          isPrimary: input.isPrimary,
          status: "pending",
          verificationToken,
        },
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError("This domain is already registered.");
        }
        throw error;
      });

    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "domain.created",
        resourceType: "domain",
        resourceId: created.id,
        after: { hostname: created.hostname },
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "domain.created", { domainId: created.id });
    return this.toSummary(created);
  }

  async update(
    ctx: TenantContext,
    id: string,
    input: UpdateDomainInput,
    meta: RequestMeta,
  ): Promise<DomainSummary> {
    const current = await this.prisma.domain.findFirst({ where: { ...this.scope(ctx), id } });
    if (!current) throw new NotFoundError("Domain");

    const data: Prisma.DomainUncheckedUpdateInput = {};
    if (input.hostname !== undefined) data.hostname = input.hostname;
    if (input.type !== undefined) data.type = input.type;
    if (input.isPrimary !== undefined) data.isPrimary = input.isPrimary;

    const updated = await this.prisma.domain
      .update({ where: { id }, data })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) throw new ConflictError("Domain already registered.");
        throw error;
      });

    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "domain.updated",
        resourceType: "domain",
        resourceId: id,
        before: { hostname: current.hostname },
        after: input,
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "domain.updated", { domainId: id });
    return this.toSummary(updated);
  }

  async verify(ctx: TenantContext, id: string, meta: RequestMeta): Promise<DomainSummary> {
    const current = await this.prisma.domain.findFirst({ where: { ...this.scope(ctx), id } });
    if (!current) throw new NotFoundError("Domain");

    // Stub for verification logic
    // In reality, this would check DNS records for the verification token.
    const updated = await this.prisma.domain.update({
      where: { id },
      data: {
        status: "verified",
        verifiedAt: new Date(),
        sslStatus: "active",
      },
    });

    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "domain.verified",
        resourceType: "domain",
        resourceId: id,
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "domain.verified", { domainId: id });

    return this.toSummary(updated);
  }

  async remove(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    const current = await this.prisma.domain.findFirst({ where: { ...this.scope(ctx), id } });
    if (!current) throw new NotFoundError("Domain");
    
    if (current.isPrimary) {
      throw new ConflictError("Cannot delete the primary domain.");
    }

    await this.prisma.domain.delete({ where: { id } });
    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "domain.deleted",
        resourceType: "domain",
        resourceId: id,
        before: { hostname: current.hostname },
        meta,
      },
      this.prisma,
    );
    await this.events.publish(ctx, "domain.deleted", { domainId: id });
  }
}
