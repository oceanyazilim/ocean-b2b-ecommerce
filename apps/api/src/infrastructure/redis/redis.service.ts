import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

import type { Env } from "../../config/env";

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  private readonly logger = new Logger("Redis");
  private lastErrorLoggedAt = 0;

  constructor(config: ConfigService<Env, true>) {
    this.client = new Redis(config.get("REDIS_URL", { infer: true }), {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
      enableOfflineQueue: true,
      retryStrategy: (attempt) => Math.min(attempt * 200, 5000),
    });
    // ioredis emits "error" on every failed reconnect; log at most once per 10s instead of
    // letting Node print an unhandled-error stack each time.
    this.client.on("error", (error: Error) => {
      const now = Date.now();
      if (now - this.lastErrorLoggedAt > 10_000) {
        this.lastErrorLoggedAt = now;
        this.logger.warn(`Redis connection error: ${error.message}`);
      }
    });
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === "PONG";
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}
