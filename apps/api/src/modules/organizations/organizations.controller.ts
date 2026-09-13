import { Body, Controller, Get, Patch, Post } from "@nestjs/common";
import {
  createOrganizationSchema,
  createStoreSchema,
  updateOrganizationSchema,
  type CreateOrganizationInput,
  type CreateStoreInput,
  type UpdateOrganizationInput,
} from "@ocean/types";

import { CurrentUserId } from "../../common/auth/current-user.decorator";
import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireOrganization } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { StoresService } from "../stores/stores.service";
import { OrganizationsService } from "./organizations.service";

@Controller("organizations")
export class OrganizationsController {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly stores: StoresService,
  ) {}

  @Get()
  list(@CurrentUserId() userId: string) {
    return this.organizations.listForUser(userId);
  }

  @Post()
  create(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(createOrganizationSchema)) body: CreateOrganizationInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.organizations.create(userId, body, meta);
  }

  @Get(":organizationId")
  @RequireOrganization("organization.read")
  get(@CurrentTenant() tenant: TenantContext) {
    return this.organizations.get(tenant);
  }

  @Patch(":organizationId")
  @RequireOrganization("organization.write")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(updateOrganizationSchema)) body: UpdateOrganizationInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.organizations.update(tenant, body, meta);
  }

  @Get(":organizationId/stores")
  @RequireOrganization("organization.read")
  listStores(@CurrentTenant() tenant: TenantContext) {
    return this.stores.listForOrganization(tenant);
  }

  @Post(":organizationId/stores")
  @RequireOrganization("stores.create")
  createStore(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createStoreSchema)) body: CreateStoreInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.stores.create(tenant, body, meta);
  }
}
