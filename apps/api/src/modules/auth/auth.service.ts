import { Injectable } from "@nestjs/common";
import { resolveOrganizationPermissions, resolveStorePermissions } from "@ocean/permissions";
import type {
  AuthUser,
  LoginInput,
  LoginResponse,
  MeResponse,
  ResetPasswordInput,
  SessionSummary,
  SignupInput,
} from "@ocean/types";

import { SessionService } from "../../common/auth/session.service";
import type { SessionRecord } from "../../common/auth/session.types";
import {
  ConflictError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import { MailService } from "../../infrastructure/mail/mail.service";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { PasswordService } from "../users/password.service";
import { UserTokenService } from "../users/user-token.service";
import { toAuthUser, UsersService } from "../users/users.service";
import { LoginEventsService } from "./login-events.service";
import { MfaService } from "./mfa.service";

const VERIFICATION_TTL = 24 * 60 * 60;
const RESET_TTL = 60 * 60;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly tokens: UserTokenService,
    private readonly sessions: SessionService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly mfa: MfaService,
    private readonly loginEvents: LoginEventsService,
  ) {}

  async signup(
    input: SignupInput,
    meta: RequestMeta,
  ): Promise<{ user: AuthUser; session: SessionRecord }> {
    const existing = await this.users.findByEmail(input.email);
    if (existing) {
      throw new ConflictError("An account with this email already exists.", [
        { path: "email", message: "Already registered" },
      ]);
    }

    const passwordHash = await this.passwords.hash(input.password);
    const { user, token } = await this.prisma.$transaction(async (tx) => {
      const created = await this.users.create(
        { email: input.email, name: input.name, passwordHash },
        tx,
      );
      const verificationToken = await this.tokens.issue(
        created.id,
        "email_verification",
        VERIFICATION_TTL,
        tx,
      );
      await this.audit.record(
        {
          actorId: created.id,
          action: "user.signed_up",
          resourceType: "user",
          resourceId: created.id,
          meta,
        },
        tx,
      );
      return { user: created, token: verificationToken };
    });

    await this.mail.sendEmailVerification(user.email, user.name, token);
    const session = await this.sessions.create("merchant", user.id, meta, { mfaVerified: true });
    await this.loginEvents.record({
      userId: user.id,
      email: user.email,
      outcome: "success",
      sessionId: session.id,
      meta,
    });
    return { user: toAuthUser(user), session };
  }

  // Returns either a session (password-only accounts) or an MFA challenge.
  async login(
    input: LoginInput,
    meta: RequestMeta,
  ): Promise<{ response: LoginResponse; session: SessionRecord | null }> {
    const user = await this.users.findByEmail(input.email);
    const valid = user ? await this.passwords.verify(user.passwordHash, input.password) : false;
    if (!user || !valid || user.status !== "active") {
      await this.loginEvents.record({
        userId: user?.id ?? null,
        email: input.email,
        outcome: "failed_password",
        meta,
      });
      throw new UnauthenticatedError("Email or password is incorrect.");
    }

    if (await this.mfa.isEnabled(user.id)) {
      const challengeToken = await this.mfa.createChallenge(user.id);
      await this.loginEvents.record({
        userId: user.id,
        email: user.email,
        outcome: "mfa_required",
        meta,
      });
      return { response: { mfaRequired: true, challengeToken }, session: null };
    }

    const session = await this.establishSession(user.id, meta, { mfaVerified: false });
    return { response: { user: toAuthUser(user) }, session };
  }

  async completeMfaLogin(
    challengeToken: string,
    code: string,
    meta: RequestMeta,
  ): Promise<{ user: AuthUser; session: SessionRecord }> {
    const challengedUserId = await this.mfa.peekChallenge(challengeToken);
    let userId: string;
    try {
      userId = await this.mfa.completeChallenge(challengeToken, code);
    } catch (error) {
      if (challengedUserId) {
        const user = await this.users.findById(challengedUserId);
        await this.loginEvents.record({
          userId: challengedUserId,
          email: user?.email ?? "",
          outcome: "failed_mfa",
          meta,
        });
      }
      throw error;
    }
    const user = await this.users.findById(userId);
    if (!user || user.status !== "active") throw new UnauthenticatedError();
    const session = await this.establishSession(user.id, meta, { mfaVerified: true });
    return { user: toAuthUser(user), session };
  }

  private async establishSession(
    userId: string,
    meta: RequestMeta,
    options: { mfaVerified: boolean },
  ): Promise<SessionRecord> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthenticatedError();
    const riskFlags = await this.loginEvents.riskFlagsFor(userId, meta);
    const session = await this.sessions.create("merchant", userId, meta, options);
    await this.loginEvents.record({
      userId,
      email: user.email,
      outcome: "success",
      riskFlags,
      sessionId: session.id,
      meta,
    });
    await this.audit.record({
      actorId: userId,
      action: "user.logged_in",
      resourceType: "user",
      resourceId: userId,
      metadata: riskFlags.length ? { riskFlags } : undefined,
      meta: { ...meta, sessionId: session.id },
    });
    // Without MFA there is no second factor standing in the way, so tell the account owner.
    if (riskFlags.length > 0 && !options.mfaVerified) {
      await this.mail.sendNewDeviceSignIn(user.email, user.name, {
        ip: meta.ip,
        userAgent: meta.userAgent,
        at: new Date(),
      });
    }
    return session;
  }

  async logout(session: SessionRecord, meta: RequestMeta): Promise<void> {
    await this.sessions.revoke(session.realm, session.id, session.userId);
    await this.audit.record({
      actorId: session.userId,
      action: "user.logged_out",
      resourceType: "user",
      resourceId: session.userId,
      meta,
    });
  }

  async listSessions(current: SessionRecord): Promise<SessionSummary[]> {
    const records = await this.sessions.listForUser(current.realm, current.userId);
    return records.map((r) => ({
      id: r.id,
      current: r.id === current.id,
      createdAt: new Date(r.createdAt).toISOString(),
      lastSeenAt: new Date(r.lastSeenAt).toISOString(),
      ip: r.ip,
      userAgent: r.userAgent,
      mfaVerified: r.mfaVerified,
    }));
  }

  async revokeSession(current: SessionRecord, id: string, meta: RequestMeta): Promise<void> {
    const owned = (await this.sessions.listForUser(current.realm, current.userId)).some(
      (s) => s.id === id,
    );
    if (!owned) throw new NotFoundError("Session");
    await this.sessions.revoke(current.realm, id, current.userId);
    await this.audit.record({
      actorId: current.userId,
      action: "user.session_revoked",
      resourceType: "session",
      resourceId: id,
      meta,
    });
  }

  async revokeOtherSessions(current: SessionRecord, meta: RequestMeta): Promise<number> {
    const count = await this.sessions.revokeAllForUser(current.realm, current.userId, current.id);
    await this.audit.record({
      actorId: current.userId,
      action: "user.session_revoked",
      resourceType: "session",
      metadata: { count, scope: "others" },
      meta,
    });
    return count;
  }

  async verifyEmail(token: string, meta: RequestMeta): Promise<AuthUser> {
    const user = await this.prisma.$transaction(async (tx) => {
      const userId = await this.tokens.consume(token, "email_verification", tx);
      if (!userId) {
        throw new ValidationError("This verification link is invalid or has expired.", [
          { path: "token", message: "Invalid or expired" },
        ]);
      }
      const verified = await this.users.markEmailVerified(userId, tx);
      await this.audit.record(
        {
          actorId: userId,
          action: "user.email_verified",
          resourceType: "user",
          resourceId: userId,
          meta,
        },
        tx,
      );
      return verified;
    });
    return toAuthUser(user);
  }

  async resendVerification(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user || user.emailVerifiedAt) return;
    const token = await this.tokens.issue(user.id, "email_verification", VERIFICATION_TTL);
    await this.mail.sendEmailVerification(user.email, user.name, token);
  }

  // Always resolves so callers cannot learn whether an email is registered.
  async forgotPassword(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user || user.status !== "active") return;
    const token = await this.tokens.issue(user.id, "password_reset", RESET_TTL);
    await this.mail.sendPasswordReset(user.email, user.name, token);
  }

  async resetPassword(input: ResetPasswordInput, meta: RequestMeta): Promise<void> {
    const passwordHash = await this.passwords.hash(input.password);
    const userId = await this.prisma.$transaction(async (tx) => {
      const id = await this.tokens.consume(input.token, "password_reset", tx);
      if (!id) {
        throw new ValidationError("This reset link is invalid or has expired.", [
          { path: "token", message: "Invalid or expired" },
        ]);
      }
      await this.users.setPassword(id, passwordHash, tx);
      await this.audit.record(
        { actorId: id, action: "user.password_reset", resourceType: "user", resourceId: id, meta },
        tx,
      );
      return id;
    });
    await this.sessions.revokeAllForUser("merchant", userId);
  }

  async me(userId: string): Promise<MeResponse> {
    const user = await this.users.findById(userId);
    if (!user || user.status !== "active") throw new UnauthenticatedError();

    const [orgMemberships, storeMemberships, mfaEnabled] = await Promise.all([
      this.prisma.organizationMember.findMany({
        where: { userId, status: "active", organization: { status: "active" } },
        include: { organization: { include: { stores: { orderBy: { createdAt: "asc" } } } } },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.storeMember.findMany({
        where: { userId, status: "active" },
        select: { storeId: true, role: true },
      }),
      this.mfa.isEnabled(userId),
    ]);
    const storeRoleById = new Map(storeMemberships.map((m) => [m.storeId, m.role]));

    return {
      user: { ...toAuthUser(user), mfaEnabled },
      organizations: orgMemberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        role: m.role,
        permissions: [...resolveOrganizationPermissions(m.role)],
        stores: m.organization.stores
          .map((s) => {
            const storeRole = storeRoleById.get(s.id) ?? null;
            const permissions = resolveStorePermissions(m.role, storeRole);
            return {
              id: s.id,
              name: s.name,
              slug: s.slug,
              status: s.status,
              defaultCurrency: s.defaultCurrency,
              defaultLocale: s.defaultLocale,
              timezone: s.timezone,
              onboardingState: (s.onboardingState ?? {}) as Record<string, boolean>,
              role: storeRole,
              permissions: [...permissions],
            };
          })
          .filter((s) => s.permissions.length > 0),
      })),
    };
  }
}
