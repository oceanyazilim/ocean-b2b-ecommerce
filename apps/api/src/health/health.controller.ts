import { Controller, Get, HttpCode, Res } from "@nestjs/common";
import type { Response } from "express";

import { Public } from "../common/auth/public.decorator";
import { HealthService } from "./health.service";

@Controller("health")
@Public()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  get() {
    return this.health.snapshot();
  }

  // Readiness: verifies the dependencies a request would need. 503 when any is down.
  @Get("ready")
  @HttpCode(200)
  async ready(@Res({ passthrough: true }) res: Response) {
    const report = await this.health.readiness();
    if (report.status !== "ok") res.status(503);
    return report;
  }
}
