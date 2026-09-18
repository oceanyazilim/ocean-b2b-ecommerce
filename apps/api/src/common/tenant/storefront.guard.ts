import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";

import { TenantService } from "./tenant.service";

@Injectable()
export class StorefrontGuard implements CanActivate {
  constructor(private readonly tenants: TenantService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    
    // In dev, the host might have a port. E.g. localhost:3002
    // We should strip the port for matching or rely on the host.
    const hostHeader = (req.headers.host as string) || "";
    const hostname = hostHeader.split(":")[0] || "";
    
    let customerId: string | null = null;
    
    const tenant = await this.tenants.forStorefront(hostname, null, req.requestId ?? "");
    
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    const sessionKey = `ocean_cs_${tenant.storeId}`;
    const sessionId = cookies[sessionKey];
      
    if (sessionId) {
      // TODO: Validate session against Redis and get customerId.
      if ((req as any).customerId) {
         customerId = (req as any).customerId;
      }
    }
    
    if (customerId) {
       tenant.actor = { type: "customer", id: customerId };
    }
    
    req.tenant = tenant;
    return true;
  }
}
