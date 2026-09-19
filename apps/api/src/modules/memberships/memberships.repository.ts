import { Injectable } from "@nestjs/common";
import type { Invitation, Prisma, StoreMember, StoreRole, User } from "@ocean/db";

import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import type { TenantContext } from "../../common/tenant/tenant-context";

export type StoreMemberWithUser = StoreMember & {
  user: User;
  customRole: { id: string; name: string } | null;
};
export type InvitationWithInviter = Invitation & { invitedBy: { id: string; name: string } };

@Injectable()
export class MembershipsRepository {
  constructor(private readonly prisma: PrismaService) {}

  listMembers(ctx: TenantContext): Promise<StoreMemberWithUser[]> {
    return this.prisma.storeMember.findMany({
      where: {
        storeId: ctx.storeId as string,
        organizationId: ctx.organizationId,
        status: "active",
      },
      include: { user: true, customRole: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  findMember(
    ctx: TenantContext,
    userId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<StoreMember | null> {
    return tx.storeMember.findFirst({
      where: { storeId: ctx.storeId as string, organizationId: ctx.organizationId, userId },
    });
  }

  countActiveOwners(
    ctx: TenantContext,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    return tx.storeMember.count({
      where: { storeId: ctx.storeId as string, role: "store_owner", status: "active" },
    });
  }

  updateMemberRole(
    ctx: TenantContext,
    memberId: string,
    role: StoreRole,
    tx: Prisma.TransactionClient,
    customRoleId: string | null = null,
  ): Promise<StoreMember> {
    return tx.storeMember.update({
      where: { id: memberId, storeId: ctx.storeId as string },
      data: { role, customRoleId: role === "custom" ? customRoleId : null },
    });
  }

  removeMember(
    ctx: TenantContext,
    memberId: string,
    tx: Prisma.TransactionClient,
  ): Promise<StoreMember> {
    return tx.storeMember.update({
      where: { id: memberId, storeId: ctx.storeId as string },
      data: { status: "removed" },
    });
  }

  listPendingInvitations(ctx: TenantContext): Promise<InvitationWithInviter[]> {
    return this.prisma.invitation.findMany({
      where: {
        storeId: ctx.storeId as string,
        organizationId: ctx.organizationId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { invitedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  findPendingInvitationByEmail(
    ctx: TenantContext,
    email: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<Invitation | null> {
    return tx.invitation.findFirst({
      where: {
        storeId: ctx.storeId as string,
        email,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
  }

  createInvitation(
    ctx: TenantContext,
    data: { email: string; role: StoreRole; tokenHash: string; expiresAt: Date },
    tx: Prisma.TransactionClient,
  ): Promise<Invitation> {
    return tx.invitation.create({
      data: {
        organizationId: ctx.organizationId,
        storeId: ctx.storeId as string,
        email: data.email,
        storeRole: data.role,
        organizationRole: "member",
        tokenHash: data.tokenHash,
        invitedById: ctx.actor.id,
        expiresAt: data.expiresAt,
      },
    });
  }

  findInvitationInTenant(ctx: TenantContext, id: string): Promise<Invitation | null> {
    return this.prisma.invitation.findFirst({
      where: { id, storeId: ctx.storeId as string, organizationId: ctx.organizationId },
    });
  }

  revokeInvitation(ctx: TenantContext, id: string): Promise<Invitation> {
    return this.prisma.invitation.update({
      where: { id, storeId: ctx.storeId as string },
      data: { revokedAt: new Date() },
    });
  }

  // Token lookups are the one path without tenant scoping: the token itself is the credential.
  findInvitationByTokenHash(tokenHash: string, tx: Prisma.TransactionClient = this.prisma) {
    return tx.invitation.findUnique({
      where: { tokenHash },
      include: {
        store: { select: { id: true, name: true, organizationId: true } },
        organization: { select: { id: true, name: true } },
      },
    });
  }
}
