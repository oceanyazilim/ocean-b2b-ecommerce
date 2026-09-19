import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { platformAuditLogQuerySchema, type PlatformAuditLogQuery } from "@ocean/types";

import { Public } from "../../common/auth/public.decorator";
import { PlatformSessionGuard } from "../../common/auth/platform-session.guard";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { PlatformAuditService } from "./platform-audit.service";

@Controller("platform/audit")
@Public()
@UseGuards(PlatformSessionGuard)
export class PlatformAuditController {
  constructor(private readonly audit: PlatformAuditService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(platformAuditLogQuerySchema)) query: PlatformAuditLogQuery,
  ) {
    return this.audit.list(query);
  }
}
