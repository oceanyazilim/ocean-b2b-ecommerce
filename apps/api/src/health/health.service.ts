import { Injectable } from "@nestjs/common";

export interface HealthSnapshot {
  status: "ok";
  service: "ocean-api";
  version: string;
  uptimeSeconds: number;
  timestamp: string;
}

@Injectable()
export class HealthService {
  private readonly startedAt = Date.now();

  snapshot(): HealthSnapshot {
    return {
      status: "ok",
      service: "ocean-api",
      version: process.env.npm_package_version ?? "0.0.0",
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }
}
