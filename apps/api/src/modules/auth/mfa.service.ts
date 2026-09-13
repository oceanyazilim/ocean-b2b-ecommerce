import { randomBytes } from "node:crypto";

import { Injectable } from "@nestjs/common";
import type { MfaSetupResponse, MfaStatus } from "@ocean/types";
import { authenticator } from "otplib";
import QRCode from "qrcode";

import { EncryptionService } from "../../common/crypto/encryption.service";
import {
  ConflictError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { RedisService } from "../../infrastructure/redis/redis.service";
import { AuditService } from "../audit/audit.service";
import { PasswordService } from "../users/password.service";
import { UsersService } from "../users/users.service";
import { consumeRecoveryCode, generateRecoveryCodes, hashRecoveryCode } from "./recovery-codes";

const ISSUER = "Ocean Commerce";
const CHALLENGE_TTL_SECONDS = 300;

authenticator.options = { window: 1 };

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly encryption: EncryptionService,
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  async status(userId: string): Promise<MfaStatus> {
    const mfa = await this.prisma.userMfa.findUnique({ where: { userId } });
    return {
      enabled: !!mfa?.enabledAt,
      enabledAt: mfa?.enabledAt?.toISOString() ?? null,
      recoveryCodesRemaining: mfa?.enabledAt ? mfa.recoveryCodeHashes.length : 0,
    };
  }

  async isEnabled(userId: string): Promise<boolean> {
    const mfa = await this.prisma.userMfa.findUnique({
      where: { userId },
      select: { enabledAt: true },
    });
    return !!mfa?.enabledAt;
  }

  async setup(userId: string): Promise<MfaSetupResponse> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundError("User");
    const existing = await this.prisma.userMfa.findUnique({ where: { userId } });
    if (existing?.enabledAt) {
      throw new ConflictError("Two-factor authentication is already enabled. Disable it first.");
    }
    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(user.email, ISSUER, secret);
    await this.prisma.userMfa.upsert({
      where: { userId },
      update: { totpSecretEnc: this.encryption.encrypt(secret), recoveryCodeHashes: [] },
      create: { userId, totpSecretEnc: this.encryption.encrypt(secret) },
    });
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 200 });
    return { secret, otpauthUrl, qrDataUrl };
  }

  async enable(userId: string, code: string, meta: RequestMeta): Promise<string[]> {
    const mfa = await this.prisma.userMfa.findUnique({ where: { userId } });
    if (!mfa)
      throw new ValidationError("Start the setup before enabling two-factor authentication.");
    if (mfa.enabledAt) throw new ConflictError("Two-factor authentication is already enabled.");
    if (!this.checkTotp(mfa.totpSecretEnc, code)) {
      throw new ValidationError(
        "That code is not valid. Check your authenticator app and try again.",
        [{ path: "code", message: "Invalid code" }],
      );
    }
    const codes = generateRecoveryCodes();
    await this.prisma.$transaction(async (tx) => {
      await tx.userMfa.update({
        where: { userId },
        data: { enabledAt: new Date(), recoveryCodeHashes: codes.map(hashRecoveryCode) },
      });
      await this.audit.record(
        {
          actorId: userId,
          action: "user.mfa_enabled",
          resourceType: "user",
          resourceId: userId,
          meta,
        },
        tx,
      );
    });
    return codes;
  }

  async disable(userId: string, password: string, code: string, meta: RequestMeta): Promise<void> {
    const user = await this.users.findById(userId);
    const mfa = await this.prisma.userMfa.findUnique({ where: { userId } });
    if (!user || !mfa?.enabledAt) throw new NotFoundError("Two-factor authentication");
    if (!(await this.passwords.verify(user.passwordHash, password))) {
      throw new ValidationError("Password is incorrect.", [
        { path: "password", message: "Incorrect" },
      ]);
    }
    if (
      !this.checkTotp(mfa.totpSecretEnc, code) &&
      !consumeRecoveryCode(mfa.recoveryCodeHashes, code)
    ) {
      throw new ValidationError("That code is not valid.", [
        { path: "code", message: "Invalid code" },
      ]);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.userMfa.delete({ where: { userId } });
      await this.audit.record(
        {
          actorId: userId,
          action: "user.mfa_disabled",
          resourceType: "user",
          resourceId: userId,
          meta,
        },
        tx,
      );
    });
  }

  async regenerateRecoveryCodes(
    userId: string,
    password: string,
    meta: RequestMeta,
  ): Promise<string[]> {
    const user = await this.users.findById(userId);
    const mfa = await this.prisma.userMfa.findUnique({ where: { userId } });
    if (!user || !mfa?.enabledAt) throw new NotFoundError("Two-factor authentication");
    if (!(await this.passwords.verify(user.passwordHash, password))) {
      throw new ValidationError("Password is incorrect.", [
        { path: "password", message: "Incorrect" },
      ]);
    }
    const codes = generateRecoveryCodes();
    await this.prisma.$transaction(async (tx) => {
      await tx.userMfa.update({
        where: { userId },
        data: { recoveryCodeHashes: codes.map(hashRecoveryCode) },
      });
      await this.audit.record(
        {
          actorId: userId,
          action: "user.recovery_codes_regenerated",
          resourceType: "user",
          resourceId: userId,
          meta,
        },
        tx,
      );
    });
    return codes;
  }

  // ---- login challenge -------------------------------------------------------------------

  async createChallenge(userId: string): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    await this.redis.client.set(`mfa:challenge:${token}`, userId, "EX", CHALLENGE_TTL_SECONDS);
    return token;
  }

  async peekChallenge(token: string): Promise<string | null> {
    return this.redis.client.get(`mfa:challenge:${token}`);
  }

  // Verifies a TOTP or recovery code for the challenged user. Consumes the challenge (and the
  // recovery code) on success; a wrong code leaves the challenge in place until it expires.
  async completeChallenge(token: string, code: string): Promise<string> {
    const userId = await this.peekChallenge(token);
    if (!userId)
      throw new UnauthenticatedError("This sign-in challenge has expired. Sign in again.");
    const mfa = await this.prisma.userMfa.findUnique({ where: { userId } });
    if (!mfa?.enabledAt) throw new UnauthenticatedError("Sign in again.");

    if (this.checkTotp(mfa.totpSecretEnc, code)) {
      await this.redis.client.del(`mfa:challenge:${token}`);
      return userId;
    }
    const remaining = consumeRecoveryCode(mfa.recoveryCodeHashes, code);
    if (remaining) {
      await this.prisma.userMfa.update({
        where: { userId },
        data: { recoveryCodeHashes: remaining },
      });
      await this.redis.client.del(`mfa:challenge:${token}`);
      return userId;
    }
    throw new UnauthenticatedError("That code is not valid.");
  }

  private checkTotp(secretEnc: string, code: string): boolean {
    const normalized = code.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(normalized)) return false;
    return authenticator.check(normalized, this.encryption.decrypt(secretEnc));
  }
}
