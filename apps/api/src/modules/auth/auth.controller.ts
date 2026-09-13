import { Body, Controller, Get, HttpCode, Post, Res, UseGuards } from "@nestjs/common";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  verifyEmailSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type ResetPasswordInput,
  type SignupInput,
  type VerifyEmailInput,
} from "@ocean/types";
import type { Response } from "express";

import { CurrentSession, CurrentUserId } from "../../common/auth/current-user.decorator";
import { Public } from "../../common/auth/public.decorator";
import { SessionService } from "../../common/auth/session.service";
import type { SessionRecord } from "../../common/auth/session.types";
import { ReqMeta, type RequestMeta } from "../../common/http/request-meta";
import { RateLimit } from "../../common/rate-limit/rate-limit.decorator";
import { RateLimitGuard } from "../../common/rate-limit/rate-limit.guard";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { AuthService } from "./auth.service";

@Controller("auth")
@UseGuards(RateLimitGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Post("signup")
  @Public()
  @RateLimit({ bucket: "signup", limit: 5, windowSeconds: 3600 })
  async signup(
    @Body(new ZodValidationPipe(signupSchema)) body: SignupInput,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, session } = await this.auth.signup(body, meta);
    this.sessions.attachCookie(res, session);
    return { user };
  }

  @Post("login")
  @Public()
  @HttpCode(200)
  @RateLimit({ bucket: "login", limit: 10, windowSeconds: 60 })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, session } = await this.auth.login(body, meta);
    this.sessions.attachCookie(res, session);
    return { user };
  }

  @Post("logout")
  @HttpCode(204)
  async logout(
    @CurrentSession() session: SessionRecord,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(session, meta);
    this.sessions.clearCookie(res);
  }

  @Get("me")
  me(@CurrentUserId() userId: string) {
    return this.auth.me(userId);
  }

  @Post("verify-email")
  @Public()
  @HttpCode(200)
  @RateLimit({ bucket: "verify", limit: 20, windowSeconds: 3600 })
  async verifyEmail(
    @Body(new ZodValidationPipe(verifyEmailSchema)) body: VerifyEmailInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    const user = await this.auth.verifyEmail(body.token, meta);
    return { user };
  }

  @Post("resend-verification")
  @HttpCode(204)
  @RateLimit({ bucket: "resend-verification", limit: 5, windowSeconds: 3600 })
  async resendVerification(@CurrentUserId() userId: string) {
    await this.auth.resendVerification(userId);
  }

  @Post("forgot-password")
  @Public()
  @HttpCode(204)
  @RateLimit({ bucket: "forgot-password", limit: 5, windowSeconds: 3600, byField: "email" })
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput,
  ) {
    await this.auth.forgotPassword(body.email);
  }

  @Post("reset-password")
  @Public()
  @HttpCode(204)
  @RateLimit({ bucket: "reset-password", limit: 10, windowSeconds: 3600 })
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.auth.resetPassword(body, meta);
  }
}
