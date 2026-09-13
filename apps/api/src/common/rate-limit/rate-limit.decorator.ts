import { SetMetadata } from "@nestjs/common";

import type { RateLimitRule } from "./rate-limit.service";

export const RATE_LIMIT_KEY = "ocean:rate-limit";

export interface RateLimitMetadata extends RateLimitRule {
  // Which body field (if any) to append to the client IP for the counter key.
  byField?: string;
}

export const RateLimit = (meta: RateLimitMetadata) =>
  SetMetadata<string, RateLimitMetadata>(RATE_LIMIT_KEY, meta);
