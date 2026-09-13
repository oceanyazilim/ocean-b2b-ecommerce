import { Injectable } from "@nestjs/common";

import { PrismaService } from "../infrastructure/prisma/prisma.service";
import { RedisService } from "../infrastructure/redis/redis.service";

export interface HealthSnapshot {
  status: "ok";
  service: "ocean-api";
  version: string;
  uptimeSeconds: number;
  timestamp: string;
}

export interface ReadinessReport {
  status: "ok" | "degraded";
  checks: Record<"postgres" | "redis", { ok: boolean; latencyMs: number }>;
  timestamp: string;
}

@Injectable()
export class HealthService {
  private readonly startedAt = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  snapshot(): HealthSnapshot {
    return {
      status: "ok",
      service: "ocean-api",
      version: process.env.npm_package_version ?? "0.0.0",
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }

  async readiness(): Promise<ReadinessReport> {
    const [postgres, redis] = await Promise.all([
      this.timed(async () => {
        await this.prisma.$queryRaw`SELECT 1`;
        return true;
      }),
      this.timed(() => this.redis.ping()),
    ]);
    return {
      status: postgres.ok && redis.ok ? "ok" : "degraded",
      checks: { postgres, redis },
      timestamp: new Date().toISOString(),
    };
  }

  private async timed(fn: () => Promise<boolean>): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      const ok = await fn();
      return { ok, latencyMs: Date.now() - start };
    } catch {
      return { ok: false, latencyMs: Date.now() - start };
    }
  }
}
