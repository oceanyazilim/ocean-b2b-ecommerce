import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";

import { SessionService } from "../auth/session.service";
import { customerSessionCookie } from "../auth/session.types";
import { NotFoundError } from "../errors/domain-error";
import { TenantService } from "./tenant.service";

// Storefront routes carry no merchant session (SessionGuard exempts them via @Public() on each
// controller); this guard resolves the store from the request's hostname instead, and layers an
// optional customer session on top — anonymous ("guest") is a normal, expected outcome here.
//
// Prefers X-Forwarded-Host over Host: the storefront app (apps/storefront) proxies its own
// server-side fetches through Node's `fetch`, which silently ignores an explicit `Host` header
// override and always sends the true connection target's host — the standard way around that,
// used by every reverse proxy for the same reason, is a forwarded-host header instead. Trusting
// a client-supplied header this way is safe here specifically because storefront data is public
// by design (product/theme reads) and cart/session cookies are already name-scoped per store id,
// so spoofing it can redirect a request to a different (still public) store's data, never hijack
// another store's session.
@Injectable()
export class StorefrontGuard implements CanActivate {
  constructor(
    private readonly tenants: TenantService,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const forwardedHost = req.headers["x-forwarded-host"];
    const hostHeader = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) || req.headers.host || "";
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
