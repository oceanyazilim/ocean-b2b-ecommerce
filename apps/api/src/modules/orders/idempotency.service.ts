import { createHash } from "node:crypto";

import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";

import { DomainError } from "../../common/errors/domain-error";
import { isUniqueViolation } from "../../common/prisma-errors";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

const TTL_MS = 24 * 60 * 60 * 1000;

// Spec §34. Callers pass the Idempotency-Key header (optional) and the request body; a replay
// with the same body returns the stored response, a replay with a different body is refused.
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(
    ctx: TenantContext,
    scope: string,
    key: string | null | undefined,
    request: unknown,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (!key) return fn();
    const storeId = ctx.storeId as string;
    const requestHash = createHash("sha256")
      .update(JSON.stringify(request ?? null))
      .digest("hex");
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { storeId_scope_key: { storeId, scope, key } },
    });
    if (existing && existing.expiresAt > new Date()) {
      if (existing.requestHash !== requestHash) {
        throw new DomainError(
          "idempotency_conflict",
          409,
          "This Idempotency-Key was already used with a different request.",
        );
      }
      return existing.responseBody as T;
    }
    if (existing) await this.prisma.idempotencyKey.delete({ where: { id: existing.id } });

    const result = await fn();
    try {
      await this.prisma.idempotencyKey.create({
        data: {
          storeId,
          scope,
          key,
          requestHash,
          responseStatus: 201,
          responseBody: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + TTL_MS),
        },
      });
    } catch (error) {
      // A concurrent request with the same key won the race; its stored response is as good.
      if (!isUniqueViolation(error)) throw error;
    }
    return result;
  }
}
