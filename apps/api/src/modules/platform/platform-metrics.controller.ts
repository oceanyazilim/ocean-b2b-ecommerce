import { Controller, Get, UseGuards } from "@nestjs/common";

import { Public } from "../../common/auth/public.decorator";
import { PlatformSessionGuard } from "../../common/auth/platform-session.guard";
import { PlatformMetricsService } from "./platform-metrics.service";

@Controller("platform/metrics")
@Public()
@UseGuards(PlatformSessionGuard)
export class PlatformMetricsController {
  constructor(private readonly metrics: PlatformMetricsService) {}

  @Get()
  summary() {
    return this.metrics.summary();
  }
}
