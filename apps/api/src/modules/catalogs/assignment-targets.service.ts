import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type { AssignmentSummary, AssignmentTargetInput } from "@ocean/types";

import { ValidationError } from "../../common/errors/domain-error";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

export const assignmentInclude = {
  company: { select: { id: true, displayName: true } },
  location: {
    select: { id: true, name: true, company: { select: { id: true, displayName: true } } },
  },
} satisfies Prisma.CatalogAssignmentInclude;

type AssignmentRow = {
  id: string;
  createdAt: Date;
  company: { id: string; displayName: string } | null;
  location: { id: string; name: string; company: { id: string; displayName: string } } | null;
};

export function toAssignmentSummary(row: AssignmentRow): AssignmentSummary {
  return {
    id: row.id,
    company: row.company,
    location: row.location
      ? {
          id: row.location.id,
          name: row.location.name,
          companyId: row.location.company.id,
          companyName: row.location.company.displayName,
        }
      : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface ResolvedTarget {
  companyId: string | null;
  companyLocationId: string | null;
}

// Catalogs and price lists attach to a company or to one of its locations. The target must
// belong to the caller's store; anything else reads as an unknown target.
@Injectable()
export class AssignmentTargetsService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    ctx: TenantContext,
    input: AssignmentTargetInput,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<ResolvedTarget> {
    if (input.companyLocationId) {
      const location = await tx.companyLocation.findFirst({
        where: {
          id: input.companyLocationId,
          storeId: ctx.storeId as string,
          company: { deletedAt: null },
        },
        select: { id: true },
      });
      if (!location) {
        throw new ValidationError("That company location is not in this store.", [
          { path: "companyLocationId", message: "Unknown location" },
        ]);
      }
      return { companyId: null, companyLocationId: location.id };
    }
    const company = await tx.company.findFirst({
      where: { id: input.companyId as string, storeId: ctx.storeId as string, deletedAt: null },
      select: { id: true },
    });
    if (!company) {
      throw new ValidationError("That company is not in this store.", [
        { path: "companyId", message: "Unknown company" },
      ]);
    }
    return { companyId: company.id, companyLocationId: null };
  }

  // Resolves a buyer to (companyId, locationId) for pricing/catalog lookups. A location implies
  // its company; a mismatched pair is rejected rather than silently trusted.
  async resolveBuyer(
    ctx: TenantContext,
    buyer: { companyId?: string | undefined; companyLocationId?: string | undefined },
  ): Promise<ResolvedTarget> {
    if (buyer.companyLocationId) {
      const location = await this.prisma.companyLocation.findFirst({
        where: {
          id: buyer.companyLocationId,
          storeId: ctx.storeId as string,
          company: { deletedAt: null },
        },
        select: { id: true, companyId: true },
      });
      if (!location || (buyer.companyId && buyer.companyId !== location.companyId)) {
        throw new ValidationError("That company location is not in this store.", [
          { path: "buyer.companyLocationId", message: "Unknown location" },
        ]);
      }
      return { companyId: location.companyId, companyLocationId: location.id };
    }
    if (buyer.companyId) {
      const company = await this.prisma.company.findFirst({
        where: { id: buyer.companyId, storeId: ctx.storeId as string, deletedAt: null },
        select: { id: true },
      });
      if (!company) {
        throw new ValidationError("That company is not in this store.", [
          { path: "buyer.companyId", message: "Unknown company" },
        ]);
      }
      return { companyId: company.id, companyLocationId: null };
    }
    return { companyId: null, companyLocationId: null };
  }
}
