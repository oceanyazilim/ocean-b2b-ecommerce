import { Body, Controller, Get, Put } from "@nestjs/common";
import { updateInvoiceSettingsSchema, type UpdateInvoiceSettingsInput } from "@ocean/types";

import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { InvoicingSettingsService } from "./invoicing-settings.service";

// Finance -> Invoicing settings (spec section 28). Same "finance.*" permission pair the Invoice
// endpoints above already use, since this configures how those invoices are numbered/headed.
@Controller("stores/:storeId/invoicing/settings")
export class InvoicingSettingsController {
  constructor(private readonly settings: InvoicingSettingsService) {}

  @Get()
  @RequireStore("finance.read")
  get(@CurrentTenant() tenant: TenantContext) {
    return this.settings.get(tenant);
  }

  @Put()
  @RequireStore("finance.write")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(updateInvoiceSettingsSchema)) body: UpdateInvoiceSettingsInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.settings.update(tenant, body, meta);
  }
}
