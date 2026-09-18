import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import {
  approvalListQuerySchema,
  approvalRuleInputSchema,
  decideApprovalSchema,
  updateApprovalRuleSchema,
  type ApprovalListQuery,
  type ApprovalRuleInput,
  type DecideApprovalInput,
  type UpdateApprovalRuleInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { ApprovalsService } from "./approvals.service";

@Controller("stores/:storeId/approval-rules")
export class ApprovalRulesController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  @RequireStore("approvals.read")
  list(@CurrentTenant() tenant: TenantContext) {
    return this.approvals.listRules(tenant);
  }

  @Post()
  @RequireStore("approvals.write")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(approvalRuleInputSchema)) body: ApprovalRuleInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.approvals.createRule(tenant, body, meta);
  }

  @Patch(":ruleId")
  @RequireStore("approvals.write")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("ruleId") id: string,
    @Body(new ZodValidationPipe(updateApprovalRuleSchema)) body: UpdateApprovalRuleInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.approvals.updateRule(tenant, id, body, meta);
  }

  @Delete(":ruleId")
  @RequireStore("approvals.write")
  @HttpCode(204)
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param("ruleId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.approvals.removeRule(tenant, id, meta);
  }
}

@Controller("stores/:storeId/approvals")
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  @RequireStore("approvals.read")
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(approvalListQuerySchema)) query: ApprovalListQuery,
  ) {
    return this.approvals.list(tenant, query);
  }

  @Get(":approvalId")
  @RequireStore("approvals.read")
  get(@CurrentTenant() tenant: TenantContext, @Param("approvalId") id: string) {
    return this.approvals.get(tenant, id);
  }

  @Post(":approvalId/approve")
  @RequireStore("approvals.write")
  approve(
    @CurrentTenant() tenant: TenantContext,
    @Param("approvalId") id: string,
    @Body(new ZodValidationPipe(decideApprovalSchema)) body: DecideApprovalInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.approvals.approve(tenant, id, body, meta);
  }

  @Post(":approvalId/reject")
  @RequireStore("approvals.write")
  reject(
    @CurrentTenant() tenant: TenantContext,
    @Param("approvalId") id: string,
    @Body(new ZodValidationPipe(decideApprovalSchema)) body: DecideApprovalInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.approvals.reject(tenant, id, body, meta);
  }
}
