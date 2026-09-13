import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  forgotPasswordSchema,
  loginSchema,
  mfaDisableSchema,
  mfaEnableSchema,
  mfaVerifySchema,
  passwordConfirmSchema,
  resetPasswordSchema,
  signupSchema,
  verifyEmailSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type MfaDisableInput,
  type MfaEnableInput,
  type MfaVerifyInput,
  type PasswordConfirmInput,
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
import { LoginEventsService } from "./login-events.service";
import { MfaService } from "./mfa.service";

@Controller("auth")
@UseGuards(RateLimitGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly mfa: MfaService,
    private readonly loginEvents: LoginEventsService,
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
    const { response, session } = await this.auth.login(body, meta);
    if (session) this.sessions.attachCookie(res, session);
    return response;
  }

  @Post("mfa/verify")
  @Public()
  @HttpCode(200)
  @RateLimit({ bucket: "mfa-verify", limit: 10, windowSeconds: 300, byField: "challengeToken" })
  async verifyMfa(
    @Body(new ZodValidationPipe(mfaVerifySchema)) body: MfaVerifyInput,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, session } = await this.auth.completeMfaLogin(
      body.challengeToken,
      body.code,
      meta,
    );
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

  // ---- MFA management ----------------------------------------------------------------------

  @Get("mfa")
  mfaStatus(@CurrentUserId() userId: string) {
    return this.mfa.status(userId);
  }

  @Post("mfa/setup")
  @HttpCode(200)
  mfaSetup(@CurrentUserId() userId: string) {
    return this.mfa.setup(userId);
  }

  @Post("mfa/enable")
  @HttpCode(200)
  async mfaEnable(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(mfaEnableSchema)) body: MfaEnableInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    const recoveryCodes = await this.mfa.enable(userId, body.code, meta);
    return { recoveryCodes };
  }

  @Post("mfa/disable")
  @HttpCode(204)
  @RateLimit({ bucket: "mfa-disable", limit: 5, windowSeconds: 900 })
  async mfaDisable(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(mfaDisableSchema)) body: MfaDisableInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.mfa.disable(userId, body.password, body.code, meta);
  }

  @Post("mfa/recovery-codes")
  @HttpCode(200)
  @RateLimit({ bucket: "mfa-recovery", limit: 5, windowSeconds: 900 })
  async regenerateRecoveryCodes(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(passwordConfirmSchema)) body: PasswordConfirmInput,
    @ReqMeta() meta: RequestMeta,
  ) {
    const recoveryCodes = await this.mfa.regenerateRecoveryCodes(userId, body.password, meta);
    return { recoveryCodes };
  }

  // ---- Sessions & history ------------------------------------------------------------------

  @Get("sessions")
  listSessions(@CurrentSession() session: SessionRecord) {
    return this.auth.listSessions(session);
  }

  @Delete("sessions/:id")
  @HttpCode(204)
  async revokeSession(
    @CurrentSession() session: SessionRecord,
    @Param("id") id: string,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.revokeSession(session, id, meta);
    if (id === session.id) this.sessions.clearCookie(res);
  }

  @Delete("sessions")
  @HttpCode(200)
  async revokeOtherSessions(
    @CurrentSession() session: SessionRecord,
    @ReqMeta() meta: RequestMeta,
  ) {
    const revoked = await this.auth.revokeOtherSessions(session, meta);
    return { revoked };
  }

  @Get("login-events")
  loginHistory(@CurrentUserId() userId: string) {
    return this.loginEvents.listForUser(userId);
  }

  // ---- Email verification & password reset -------------------------------------------------

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
