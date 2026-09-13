import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import {
  acceptInvitationSchema,
  createInvitationSchema,
  updateMemberRoleSchema,
  type AcceptInvitationInput,
  type CreateInvitationInput,
  type UpdateMemberRoleInput,
} from "@ocean/types";

import { CurrentUserId } from "../../common/auth/current-user.decorator";
import { Public } from "../../common/auth/public.decorator";
import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { MembershipsService } from "./memberships.service";

@Controller("stores/:storeId")
export class StoreMembersController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get("members")
  @RequireStore("users.manage")
  list(@CurrentTenant() tenant: TenantContext) {
    return this.memberships.listMembers(tenant);
  }

  @Patch("members/:userId")
  @RequireStore("users.manage")
  @HttpCode(204)
  async updateRole(
    @CurrentTenant() tenant: TenantContext,
    @Param("userId") userId: string,
    @Body(new ZodValidationPipe(updateMemberRoleSchema)) body: UpdateMemberRoleInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.memberships.updateRole(tenant, userId, body, meta);
  }

  @Delete("members/:userId")
  @RequireStore("users.manage")
  @HttpCode(204)
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param("userId") userId: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.memberships.removeMember(tenant, userId, meta);
  }

  @Get("invitations")
  @RequireStore("users.manage")
  listInvitations(@CurrentTenant() tenant: TenantContext) {
    return this.memberships.listInvitations(tenant);
  }

  @Post("invitations")
  @RequireStore("users.manage")
  invite(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createInvitationSchema)) body: CreateInvitationInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.memberships.invite(tenant, body, meta);
  }

  @Delete("invitations/:invitationId")
  @RequireStore("users.manage")
  @HttpCode(204)
  async revoke(
    @CurrentTenant() tenant: TenantContext,
    @Param("invitationId") invitationId: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.memberships.revokeInvitation(tenant, invitationId, meta);
  }
}

@Controller("invitations")
export class InvitationsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get(":token")
  @Public()
  preview(@Param("token") token: string) {
    return this.memberships.preview(token);
  }

  @Post("accept")
  @HttpCode(200)
  accept(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(acceptInvitationSchema)) body: AcceptInvitationInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.memberships.accept(userId, body.token, meta);
  }
}
