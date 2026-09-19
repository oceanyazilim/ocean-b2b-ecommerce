import type { SessionRecord } from "../auth/session.types";
import type { TenantContext } from "../tenant/tenant-context";
import type { ApiKeyPrincipal } from "../../modules/developers/api-key.guard";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      session?: SessionRecord;
      customerSession?: SessionRecord;
      tenant?: TenantContext;
      apiKey?: ApiKeyPrincipal;
    }
  }
}

export {};
