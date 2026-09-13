import { Injectable } from "@nestjs/common";

import { RedisService } from "../../infrastructure/redis/redis.service";
import { RateLimitedError } from "../errors/domain-error";

export interface RateLimitRule {
  bucket: string;
  limit: number;
  windowSeconds: number;
}

// Fixed-window counter in Redis. Enough for auth abuse protection; swap for a sliding
// window when API-key rate limiting (Phase 15) needs smoother behaviour.
@Injectable()
export class RateLimitService {
  constructor(private readonly redis: RedisService) {}

  async consume(rule: RateLimitRule, key: string): Promise<void> {
    const redisKey = `rl:${rule.bucket}:${key}`;
    const count = await this.redis.client.incr(redisKey);
    if (count === 1) {
      await this.redis.client.expire(redisKey, rule.windowSeconds);
    }
    if (count > rule.limit) {
      const ttl = await this.redis.client.ttl(redisKey);
      throw new RateLimitedError(ttl > 0 ? ttl : rule.windowSeconds);
    }
  }

  async reset(bucket: string, key: string): Promise<void> {
    await this.redis.client.del(`rl:${bucket}:${key}`);
  }
}
