import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type { GlossaryTermInput, GlossaryTermSummary } from "@ocean/types";

import { ConflictError, NotFoundError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

type GlossaryRow = Prisma.GlossaryTermGetPayload<Record<string, never>>;

// Glossary (spec section 7): brand/product terms that must never be translated, e.g. the store
// name itself, product line names, trademarked terms. The Translations UI fetches this list and
// flags (client-side) when a source string contains one of these terms, so a translator knows to
// leave that word as-is — this store never auto-alters translated text based on it.
@Injectable()
export class GlossaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private scope(ctx: TenantContext): Prisma.GlossaryTermWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId };
  }

  private toSummary(row: GlossaryRow): GlossaryTermSummary {
    return {
      id: row.id,
      term: row.term,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async list(ctx: TenantContext): Promise<GlossaryTermSummary[]> {
    const rows = await this.prisma.glossaryTerm.findMany({ where: this.scope(ctx), orderBy: { term: "asc" } });
    return rows.map((r) => this.toSummary(r));
  }

  async create(ctx: TenantContext, input: GlossaryTermInput, meta: RequestMeta): Promise<GlossaryTermSummary> {
    const existing = await this.prisma.glossaryTerm.findFirst({
      where: { ...this.scope(ctx), term: { equals: input.term, mode: "insensitive" } },
    });
    if (existing) throw new ConflictError("This term is already in the glossary.");

    const created = await this.prisma.glossaryTerm.create({
      data: {
        storeId: ctx.storeId as string,
        organizationId: ctx.organizationId,
        term: input.term,
        notes: input.notes ?? null,
      },
    });
    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "glossary_term.created",
        resourceType: "glossary_term",
        resourceId: created.id,
        after: { term: created.term },
        meta,
      },
      this.prisma,
    );
    return this.toSummary(created);
  }

  async update(
    ctx: TenantContext,
    id: string,
    input: GlossaryTermInput,
    meta: RequestMeta,
  ): Promise<GlossaryTermSummary> {
    const current = await this.prisma.glossaryTerm.findFirst({ where: { ...this.scope(ctx), id } });
    if (!current) throw new NotFoundError("Glossary term");

    const updated = await this.prisma.glossaryTerm
      .update({ where: { id }, data: { term: input.term, notes: input.notes ?? null } })
      .catch((error: unknown) => {
        const code = typeof error === "object" && error !== null ? (error as { code?: string }).code : undefined;
        if (code === "P2002") throw new ConflictError("This term is already in the glossary.");
        throw error;
      });

    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "glossary_term.updated",
        resourceType: "glossary_term",
        resourceId: id,
        before: { term: current.term },
        after: { term: updated.term },
        meta,
      },
      this.prisma,
    );
    return this.toSummary(updated);
  }

  async remove(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    const current = await this.prisma.glossaryTerm.findFirst({ where: { ...this.scope(ctx), id } });
    if (!current) throw new NotFoundError("Glossary term");
    await this.prisma.glossaryTerm.delete({ where: { id } });
    await this.audit.record(
      {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "glossary_term.deleted",
        resourceType: "glossary_term",
        resourceId: id,
        before: { term: current.term },
        meta,
      },
      this.prisma,
    );
  }
}
