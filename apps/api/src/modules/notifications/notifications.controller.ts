import { Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { notificationListQuerySchema, type NotificationListQuery } from "@ocean/types";

import { CurrentTenant } from "../../common/tenant/current-tenant.decorator";
import { RequireStore } from "../../common/tenant/require-permission.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { NotificationsService } from "./notifications.service";

// Any active store member can see (and clear) their own notifications — there's no dedicated
// permission for "my inbox", just store membership (RequireStore with no requirement).
@Controller("stores/:storeId/notifications")
@RequireStore()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(notificationListQuerySchema)) query: NotificationListQuery,
  ) {
    return this.notifications.list(tenant, query);
  }

  @Get("unread-count")
  async unreadCount(@CurrentTenant() tenant: TenantContext) {
    return { count: await this.notifications.unreadCount(tenant) };
  }

  @Post(":id/read")
  @HttpCode(204)
  async markRead(@CurrentTenant() tenant: TenantContext, @Param("id") id: string) {
    await this.notifications.markRead(tenant, id);
  }

  @Post("read-all")
  @HttpCode(204)
  async markAllRead(@CurrentTenant() tenant: TenantContext) {
    await this.notifications.markAllRead(tenant);
  }
}
