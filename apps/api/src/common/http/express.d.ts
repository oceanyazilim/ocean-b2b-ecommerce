import type { SessionRecord } from "../auth/session.types";
import type { TenantContext } from "../tenant/tenant-context";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      session?: SessionRecord;
      tenant?: TenantContext;
    }
  }
}

export {};
