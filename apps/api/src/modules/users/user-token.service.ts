import { createHash, randomBytes } from "node:crypto";

import { Injectable } from "@nestjs/common";
import type { Prisma, UserTokenPurpose } from "@ocean/db";

import { PrismaService } from "../../infrastructure/prisma/prisma.service";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Single-use, hashed-at-rest tokens for email verification and password reset.
// Issuing a new token invalidates earlier unused ones for the same purpose.
@Injectable()
export class UserTokenService {
  constructor(private readonly prisma: PrismaService) {}

  async issue(
    userId: string,
    purpose: UserTokenPurpose,
    ttlSeconds: number,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    await tx.userToken.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.userToken.create({
      data: {
        userId,
        purpose,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      },
    });
    return token;
  }

  // Returns the owning user id, or null if the token is unknown, used, or expired.
  async consume(
    token: string,
    purpose: UserTokenPurpose,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<string | null> {
    const row = await tx.userToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt.getTime() < Date.now()) {
      return null;
    }
    const updated = await tx.userToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return updated.count === 1 ? row.userId : null;
  }
}
