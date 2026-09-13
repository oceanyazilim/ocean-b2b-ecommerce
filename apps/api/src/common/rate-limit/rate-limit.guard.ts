import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

import { RATE_LIMIT_KEY, type RateLimitMetadata } from "./rate-limit.decorator";
import { RateLimitService } from "./rate-limit.service";

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.get<RateLimitMetadata | undefined>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );
    if (!meta) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const ip = req.ip ?? "unknown";
    const field =
      meta.byField && typeof (req.body as Record<string, unknown>)?.[meta.byField] === "string"
        ? String((req.body as Record<string, unknown>)[meta.byField]).toLowerCase()
        : "";
    await this.limiter.consume(meta, field ? `${ip}:${field}` : ip);
    return true;
  }
}
