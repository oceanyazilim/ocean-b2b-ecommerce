import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import {
  createCustomerSchema,
  customerAddressInputSchema,
  customerBulkActionSchema,
  customerListQuerySchema,
  customerSearchQuerySchema,
  setMetafieldsSchema,
  updateCustomerAddressSchema,
  updateCustomerSchema,
  type CreateCustomerInput,
  type CustomerAddressInput,
  type CustomerBulkAction,
  type CustomerListQuery,
  type CustomerSearchQuery,
  type SetMetafieldsInput,
  type UpdateCustomerAddressInput,
  type UpdateCustomerInput,
} from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { MetafieldsService } from "../catalog/metafields/metafields.service";
import { CustomersService } from "./customers.service";

@Controller("stores/:storeId/customers")
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly metafields: MetafieldsService,
  ) {}

  @Get()
  @RequireStore("customers.read")
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(customerListQuerySchema)) query: CustomerListQuery,
  ) {
    return this.customers.list(tenant, query);
  }

  @Get("stats")
  @RequireStore("customers.read")
  stats(@CurrentTenant() tenant: TenantContext) {
    return this.customers.stats(tenant);
  }

  @Get("search")
  @RequireStore("customers.read")
  search(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(customerSearchQuerySchema)) query: CustomerSearchQuery,
  ) {
    return this.customers.search(tenant, query);
  }

  @Post()
  @RequireStore("customers.write")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createCustomerSchema)) body: CreateCustomerInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.customers.create(tenant, body, meta);
  }

  @Post("bulk")
  @RequireStore("customers.write")
  @HttpCode(200)
  bulk(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(customerBulkActionSchema)) body: CustomerBulkAction,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.customers.bulk(tenant, body, meta);
  }

  @Get(":customerId")
  @RequireStore("customers.read")
  get(@CurrentTenant() tenant: TenantContext, @Param("customerId") id: string) {
    return this.customers.get(tenant, id);
  }

  @Patch(":customerId")
  @RequireStore("customers.write")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("customerId") id: string,
    @Body(new ZodValidationPipe(updateCustomerSchema)) body: UpdateCustomerInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.customers.update(tenant, id, body, meta);
  }

  @Delete(":customerId")
  @RequireStore("customers.write")
  @HttpCode(204)
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param("customerId") id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.customers.remove(tenant, id, meta);
  }

  @Post(":customerId/addresses")
  @RequireStore("customers.write")
  addAddress(
    @CurrentTenant() tenant: TenantContext,
    @Param("customerId") id: string,
    @Body(new ZodValidationPipe(customerAddressInputSchema)) body: CustomerAddressInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.customers.addAddress(tenant, id, body, meta);
  }

  @Patch(":customerId/addresses/:addressId")
  @RequireStore("customers.write")
  updateAddress(
    @CurrentTenant() tenant: TenantContext,
    @Param("customerId") id: string,
    @Param("addressId") addressId: string,
    @Body(new ZodValidationPipe(updateCustomerAddressSchema)) body: UpdateCustomerAddressInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.customers.updateAddress(tenant, id, addressId, body, meta);
  }

  @Delete(":customerId/addresses/:addressId")
  @RequireStore("customers.write")
  @HttpCode(200)
  removeAddress(
    @CurrentTenant() tenant: TenantContext,
    @Param("customerId") id: string,
    @Param("addressId") addressId: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.customers.removeAddress(tenant, id, addressId, meta);
  }

  @Get(":customerId/metafields")
  @RequireStore("customers.read")
  async getMetafields(@CurrentTenant() tenant: TenantContext, @Param("customerId") id: string) {
    await this.customers.get(tenant, id);
    return this.metafields.getForOwner(tenant, "customer", id);
  }

  @Patch(":customerId/metafields")
  @RequireStore("customers.write")
  async setMetafields(
    @CurrentTenant() tenant: TenantContext,
    @Param("customerId") id: string,
    @Body(new ZodValidationPipe(setMetafieldsSchema)) body: SetMetafieldsInput,
  ) {
    await this.customers.get(tenant, id);
    return this.metafields.setForOwner(tenant, "customer", id, body.metafields);
  }
}
