import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

import type { TenantContext } from "./tenant-context";

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const tenant = ctx.switchToHttp().getRequest<Request>().tenant;
    if (!tenant) {
      throw new Error("CurrentTenant used on a route without RequireStore/RequireOrganization");
    }
    return tenant;
  },
);
