import { randomBytes } from "node:crypto";

import { Injectable } from "@nestjs/common";
import type { StoreRole } from "@ocean/db";
import type {
  CreateInvitationInput,
  InvitationPreview,
  InvitationSummary,
  StoreMemberSummary,
  UpdateMemberRoleInput,
} from "@ocean/types";

import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { MailService } from "../../infrastructure/mail/mail.service";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { hashToken } from "../users/user-token.service";
import { UsersService } from "../users/users.service";
import {
  MembershipsRepository,
  type InvitationWithInviter,
  type StoreMemberWithUser,
} from "./memberships.repository";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function toMemberSummary(m: StoreMemberWithUser): StoreMemberSummary {
  return {
    userId: m.userId,
    email: m.user.email,
    name: m.user.name,
    role: m.role,
    customRole: m.customRole,
    status: m.status,
    joinedAt: m.createdAt.toISOString(),
  };
}

function toInvitationSummary(i: InvitationWithInviter): InvitationSummary {
  return {
    id: i.id,
    email: i.email,
    role: i.storeRole ?? "viewer",
    invitedBy: i.invitedBy,
    expiresAt: i.expiresAt.toISOString(),
    createdAt: i.createdAt.toISOString(),
  };
}

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: MembershipsRepository,
    private readonly users: UsersService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  async listMembers(tenant: TenantContext): Promise<StoreMemberSummary[]> {
    return (await this.repo.listMembers(tenant)).map(toMemberSummary);
  }

  async updateRole(
    tenant: TenantContext,
    userId: string,
    input: UpdateMemberRoleInput,
    meta: RequestMeta,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const member = await this.repo.findMember(tenant, userId, tx);
      if (!member || member.status !== "active") throw new NotFoundError("Member");
      const nextCustomRoleId = input.role === "custom" ? (input.customRoleId ?? null) : null;
      if (member.role === input.role && member.customRoleId === nextCustomRoleId) return;
      if (member.role === "store_owner" && (await this.repo.countActiveOwners(tenant, tx)) <= 1) {
        throw new ConflictError(
          "A store must keep at least one owner. Assign another owner first.",
        );
      }
      if (input.role === "custom" && nextCustomRoleId) {
        const customRole = await tx.customRole.findFirst({
          where: { id: nextCustomRoleId, storeId: tenant.storeId as string },
        });
        if (!customRole) throw new NotFoundError("Custom role");
      }
      await this.repo.updateMemberRole(tenant, member.id, input.role, tx, nextCustomRoleId);
      await this.audit.record(
        {
          organizationId: tenant.organizationId,
          storeId: tenant.storeId,
          actorId: tenant.actor.id,
          action: "store.member_role_changed",
          resourceType: "store_member",
          resourceId: userId,
          before: { role: member.role },
          after: { role: input.role },
          meta,
        },
        tx,
      );
    });
  }

  async removeMember(tenant: TenantContext, userId: string, meta: RequestMeta): Promise<void> {
    if (userId === tenant.actor.id) {
      throw new ForbiddenError("You cannot remove yourself from the store.");
    }
    await this.prisma.$transaction(async (tx) => {
      const member = await this.repo.findMember(tenant, userId, tx);
      if (!member || member.status !== "active") throw new NotFoundError("Member");
      if (member.role === "store_owner" && (await this.repo.countActiveOwners(tenant, tx)) <= 1) {
        throw new ConflictError(
          "A store must keep at least one owner. Assign another owner first.",
        );
      }
      await this.repo.removeMember(tenant, member.id, tx);
      await this.audit.record(
        {
          organizationId: tenant.organizationId,
          storeId: tenant.storeId,
          actorId: tenant.actor.id,
          action: "store.member_removed",
          resourceType: "store_member",
          resourceId: userId,
          before: { role: member.role },
          meta,
        },
        tx,
      );
    });
  }

  async listInvitations(tenant: TenantContext): Promise<InvitationSummary[]> {
    return (await this.repo.listPendingInvitations(tenant)).map(toInvitationSummary);
  }

  async invite(
    tenant: TenantContext,
    input: CreateInvitationInput,
    meta: RequestMeta,
  ): Promise<InvitationSummary> {
    const token = randomBytes(32).toString("base64url");
    const [inviter, store] = await Promise.all([
      this.users.findById(tenant.actor.id),
      this.prisma.store.findFirst({
        where: { id: tenant.storeId as string, organizationId: tenant.organizationId },
        select: { name: true },
      }),
    ]);
    if (!inviter || !store) throw new NotFoundError("Store");

    const invitation = await this.prisma.$transaction(async (tx) => {
      const existingUser = await this.users.findByEmail(input.email, tx);
      if (existingUser) {
        const member = await this.repo.findMember(tenant, existingUser.id, tx);
        if (member?.status === "active") {
          throw new ConflictError("This person is already a member of the store.", [
            { path: "email", message: "Already a member" },
          ]);
        }
      }
      if (await this.repo.findPendingInvitationByEmail(tenant, input.email, tx)) {
        throw new ConflictError("An invitation for this email is already pending.", [
          { path: "email", message: "Invitation pending" },
        ]);
      }
      const created = await this.repo.createInvitation(
        tenant,
        {
          email: input.email,
          role: input.role,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        },
        tx,
      );
      await this.audit.record(
        {
          organizationId: tenant.organizationId,
          storeId: tenant.storeId,
          actorId: tenant.actor.id,
          action: "invitation.created",
          resourceType: "invitation",
          resourceId: created.id,
          after: { email: created.email, role: created.storeRole },
          meta,
        },
        tx,
      );
      return created;
    });

    await this.mail.sendInvitation(input.email, inviter.name, store.name, input.role, token);
    return toInvitationSummary({
      ...invitation,
      invitedBy: { id: inviter.id, name: inviter.name },
    });
  }

  async revokeInvitation(tenant: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    const invitation = await this.repo.findInvitationInTenant(tenant, id);
    if (!invitation || invitation.acceptedAt || invitation.revokedAt) {
      throw new NotFoundError("Invitation");
    }
    await this.repo.revokeInvitation(tenant, id);
    await this.audit.record({
      organizationId: tenant.organizationId,
      storeId: tenant.storeId,
      actorId: tenant.actor.id,
      action: "invitation.revoked",
      resourceType: "invitation",
      resourceId: id,
      before: { email: invitation.email, role: invitation.storeRole },
      meta,
    });
  }

  async preview(token: string): Promise<InvitationPreview> {
    const invitation = await this.repo.findInvitationByTokenHash(hashToken(token));
    if (!invitation || invitation.revokedAt || invitation.expiresAt.getTime() < Date.now()) {
      throw new NotFoundError("Invitation", "This invitation is invalid or has expired.");
    }
    return {
      storeName: invitation.store?.name ?? invitation.organization.name,
      organizationName: invitation.organization.name,
      role: invitation.storeRole ?? "member",
      email: invitation.email,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  // Idempotent: accepting an already-accepted invitation as the same user is a no-op success.
  async accept(
    userId: string,
    token: string,
    meta: RequestMeta,
  ): Promise<{ storeId: string | null; organizationId: string }> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundError("User");

    return this.prisma.$transaction(async (tx) => {
      const invitation = await this.repo.findInvitationByTokenHash(hashToken(token), tx);
      if (!invitation || invitation.revokedAt || invitation.expiresAt.getTime() < Date.now()) {
        throw new NotFoundError("Invitation", "This invitation is invalid or has expired.");
      }
      if (invitation.email !== user.email) {
        throw new ValidationError(
          `This invitation was sent to ${invitation.email}. Sign in with that address to accept it.`,
        );
      }

      const organizationId = invitation.organizationId;
      await tx.organizationMember.upsert({
        where: { organizationId_userId: { organizationId, userId } },
        update: { status: "active" },
        create: { organizationId, userId, role: invitation.organizationRole ?? "member" },
      });
      if (invitation.storeId) {
        const role: StoreRole = invitation.storeRole ?? "viewer";
        await tx.storeMember.upsert({
          where: { storeId_userId: { storeId: invitation.storeId, userId } },
          update: { status: "active", role },
          create: { storeId: invitation.storeId, organizationId, userId, role },
        });
      }
      if (!invitation.acceptedAt) {
        await tx.invitation.update({
          where: { id: invitation.id },
          data: { acceptedAt: new Date() },
        });
        await this.audit.record(
          {
            organizationId,
            storeId: invitation.storeId,
            actorId: userId,
            action: "invitation.accepted",
            resourceType: "invitation",
            resourceId: invitation.id,
            after: { email: invitation.email, role: invitation.storeRole },
            meta,
          },
          tx,
        );
      }
      return { storeId: invitation.storeId, organizationId };
    });
  }
}
