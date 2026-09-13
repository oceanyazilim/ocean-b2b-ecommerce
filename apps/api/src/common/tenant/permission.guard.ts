import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { missing, satisfies } from "@ocean/permissions";
import type { Request } from "express";

import { ForbiddenError, UnauthenticatedError } from "../errors/domain-error";
import { PERMISSION_KEY, type PermissionMetadata } from "./require-permission.decorator";
import { TenantService } from "./tenant.service";

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenants: TenantService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<PermissionMetadata | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!meta) return true;

    const req = context.switchToHttp().getRequest<Request>();
    if (!req.session) throw new UnauthenticatedError();

    const id = String((req.params as Record<string, string>)[meta.param] ?? "");
    const tenant =
      meta.scope === "store"
        ? await this.tenants.forStore(req.session.userId, id, req.requestId)
        : await this.tenants.forOrganization(req.session.userId, id, req.requestId);
    req.tenant = tenant;

    if (!meta.requirement) return true;
    const granted =
      meta.scope === "store" ? tenant.storePermissions : tenant.organizationPermissions;
    if (satisfies(granted, meta.requirement)) return true;

    throw new ForbiddenError(
      "You do not have permission to do this.",
      missing(granted, meta.requirement),
    );
  }
}
