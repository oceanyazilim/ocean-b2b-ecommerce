import { Controller, Get, Header, Query } from "@nestjs/common";
import { analyticsRangeQuerySchema, type AnalyticsRangeQuery } from "@ocean/types";

import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { AnalyticsService } from "./analytics.service";

@Controller("stores/:storeId/analytics")
@RequireStore("analytics.read")
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get("overview")
  overview(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(analyticsRangeQuerySchema)) query: AnalyticsRangeQuery,
  ) {
    return this.analytics.overview(tenant, query);
  }

  @Get("top-products")
  topProducts(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(analyticsRangeQuerySchema)) query: AnalyticsRangeQuery,
  ) {
    return this.analytics.topProducts(tenant, query);
  }

  @Get("top-customers")
  topCustomers(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(analyticsRangeQuerySchema)) query: AnalyticsRangeQuery,
  ) {
    return this.analytics.topCustomers(tenant, query);
  }

  @Get("top-companies")
  topCompanies(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(analyticsRangeQuerySchema)) query: AnalyticsRangeQuery,
  ) {
    return this.analytics.topCompanies(tenant, query);
  }

  @Get("top-companies/export")
  @Header("Content-Type", "text/csv")
  @Header("Content-Disposition", 'attachment; filename="top-companies.csv"')
  async exportTopCompanies(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(analyticsRangeQuerySchema)) query: AnalyticsRangeQuery,
  ) {
    return this.analytics.topCompaniesCsv(tenant, query);
  }
}
