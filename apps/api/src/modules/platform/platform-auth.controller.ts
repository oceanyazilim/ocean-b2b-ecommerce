import { Controller, Get, HttpCode, Post, Res, UseGuards } from "@nestjs/common";
import { Body } from "@nestjs/common";
import { platformLoginSchema, type PlatformLoginInput } from "@ocean/types";
import type { Response } from "express";

import { Public } from "../../common/auth/public.decorator";
import { PlatformSessionGuard } from "../../common/auth/platform-session.guard";
import {
  CurrentPlatformOperatorId,
  CurrentPlatformSession,
} from "../../common/auth/current-platform-operator.decorator";
import { SessionService } from "../../common/auth/session.service";
import type { SessionRecord } from "../../common/auth/session.types";
import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { RateLimit } from "../../common/rate-limit/rate-limit.decorator";
import { RateLimitGuard } from "../../common/rate-limit/rate-limit.guard";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { PlatformAuthService } from "./platform-auth.service";

// Never nested under /admin/v1 (see main.ts's setGlobalPrefix exclude) and always @Public() so
// the merchant SessionGuard never gets a vote here — PlatformSessionGuard (its own cookie, its
// own Redis session realm) is the only thing standing between the open internet and this
// controller, except for /login itself which necessarily has no session yet.
@Controller("platform/auth")
@Public()
@UseGuards(RateLimitGuard)
export class PlatformAuthController {
  constructor(
    private readonly auth: PlatformAuthService,
    private readonly sessions: SessionService,
  ) {}

  @Post("login")
  @HttpCode(200)
  @RateLimit({ bucket: "platform-login", limit: 10, windowSeconds: 60 })
  async login(
    @Body(new ZodValidationPipe(platformLoginSchema)) body: PlatformLoginInput,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { operator, session } = await this.auth.login(body, meta);
    this.sessions.attachPlatformCookie(res, session);
    return { operator };
  }

  @Post("logout")
  @HttpCode(204)
  @UseGuards(PlatformSessionGuard)
  async logout(
    @CurrentPlatformSession() session: SessionRecord,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(session, meta);
    this.sessions.clearPlatformCookie(res);
  }

  @Get("me")
  @UseGuards(PlatformSessionGuard)
  me(@CurrentPlatformOperatorId() operatorId: string) {
    return this.auth.me(operatorId);
  }
}
