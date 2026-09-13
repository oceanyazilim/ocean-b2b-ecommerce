import { Injectable } from "@nestjs/common";
import type { Organization, Prisma } from "@ocean/db";

import { PrismaService } from "../../infrastructure/prisma/prisma.service";

@Injectable()
export class OrganizationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  slugExists(slug: string, tx: Prisma.TransactionClient = this.prisma): Promise<boolean> {
    return tx.organization.findUnique({ where: { slug }, select: { id: true } }).then(Boolean);
  }

  findById(id: string): Promise<Organization | null> {
    return this.prisma.organization.findUnique({ where: { id } });
  }

  listForUser(userId: string): Promise<Organization[]> {
    return this.prisma.organization.findMany({
      where: { members: { some: { userId, status: "active" } }, status: "active" },
      orderBy: { createdAt: "asc" },
    });
  }

  createWithOwner(
    data: { name: string; slug: string },
    ownerUserId: string,
    tx: Prisma.TransactionClient,
  ): Promise<Organization> {
    return tx.organization.create({
      data: { ...data, members: { create: { userId: ownerUserId, role: "owner" } } },
    });
  }

  update(id: string, data: Prisma.OrganizationUpdateInput): Promise<Organization> {
    return this.prisma.organization.update({ where: { id }, data });
  }
}
