import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";

import { SessionService } from "../auth/session.service";
import { customerSessionCookie } from "../auth/session.types";
import { NotFoundError } from "../errors/domain-error";
import { TenantService } from "./tenant.service";

// Storefront routes carry no merchant session (SessionGuard exempts them via @Public() on each
// controller); this guard resolves the store from the request's Host header instead, and layers
// an optional customer session on top — anonymous ("guest") is a normal, expected outcome here.
@Injectable()
export class StorefrontGuard implements CanActivate {
  constructor(
    private readonly tenants: TenantService,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const hostHeader = req.headers.host ?? "";
    const hostname = hostHeader.split(":")[0] ?? "";
    if (!hostname) throw new NotFoundError("Store");

    const tenant = await this.tenants.forStorefront(hostname, null, req.requestId ?? "");

    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    const cookieValue = cookies[customerSessionCookie(tenant.storeId as string)];
    const sessionId = this.sessions.idFromCookie(cookieValue);
    const session = sessionId ? await this.sessions.load("customer", sessionId) : null;
    if (session) {
      tenant.actor = { type: "customer", id: session.userId };
      req.customerSession = session;
    }

    req.tenant = tenant;
    return true;
  }
}
