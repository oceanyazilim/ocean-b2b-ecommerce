import { Controller, Get, Header, Query } from "@nestjs/common";
import { auditLogQuerySchema, type AuditLogQuery } from "@ocean/types";

import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { AuditService } from "./audit.service";

@Controller("stores/:storeId/audit-logs")
@RequireStore("settings.read")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(auditLogQuerySchema)) query: AuditLogQuery,
  ) {
    return this.audit.listForStore(tenant.storeId as string, query);
  }

  @Get("export")
  @Header("Content-Type", "text/csv")
  @Header("Content-Disposition", 'attachment; filename="audit-log.csv"')
  exportCsv(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(auditLogQuerySchema)) query: AuditLogQuery,
  ) {
    return this.audit.exportCsv(tenant.storeId as string, query);
  }
}
