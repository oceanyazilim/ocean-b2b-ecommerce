import { Controller, Get, Query } from "@nestjs/common";
import { cursorPaginationQuerySchema, type CursorPaginationQuery } from "@ocean/types";

import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { AuditService } from "./audit.service";

@Controller("stores/:storeId/audit-logs")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequireStore("settings.read")
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(cursorPaginationQuerySchema)) query: CursorPaginationQuery,
  ) {
    return this.audit.listForStore(tenant.storeId as string, query);
  }
}
