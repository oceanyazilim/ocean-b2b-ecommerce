import { Injectable } from "@nestjs/common";
import type { PlatformLoginInput, PlatformMeResponse, PlatformOperatorSummary } from "@ocean/types";

import { SessionService } from "../../common/auth/session.service";
import type { SessionRecord } from "../../common/auth/session.types";
import { UnauthenticatedError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { PasswordService } from "../users/password.service";
import { AuditService } from "../audit/audit.service";

function toSummary(operator: {
  id: string;
  email: string;
  name: string;
  status: string;
  createdAt: Date;
}): PlatformOperatorSummary {
  return {
    id: operator.id,
    email: operator.email,
    name: operator.name,
    status: operator.status as PlatformOperatorSummary["status"],
    createdAt: operator.createdAt.toISOString(),
  };
}

// Deliberately its own service, not a mode of AuthService: platform operators are a wholly
// separate identity (PlatformOperator, not User) with their own session realm. See
// packages/db/prisma/schema.prisma's PlatformOperator model comment for why.
@Injectable()
export class PlatformAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async login(
    input: PlatformLoginInput,
    meta: RequestMeta,
  ): Promise<{ operator: PlatformOperatorSummary; session: SessionRecord }> {
    const operator = await this.prisma.platformOperator.findUnique({
      where: { email: input.email },
    });
    const valid = operator ? await this.passwords.verify(operator.passwordHash, input.password) : false;
    if (!operator || !valid || operator.status !== "active") {
      throw new UnauthenticatedError("Email or password is incorrect.");
    }

    const session = await this.sessions.create("platform", operator.id, meta, { mfaVerified: true });
    await this.audit.record({
      actorType: "platform",
      actorId: operator.id,
      action: "platform_operator.logged_in",
      resourceType: "platform_operator",
      resourceId: operator.id,
      meta: { ...meta, sessionId: session.id },
    });
    return { operator: toSummary(operator), session };
  }

  async logout(session: SessionRecord, meta: RequestMeta): Promise<void> {
    await this.sessions.revoke(session.realm, session.id, session.userId);
    await this.audit.record({
      actorType: "platform",
      actorId: session.userId,
      action: "platform_operator.logged_out",
      resourceType: "platform_operator",
      resourceId: session.userId,
      meta,
    });
  }

  async me(operatorId: string): Promise<PlatformMeResponse> {
    const operator = await this.prisma.platformOperator.findUnique({ where: { id: operatorId } });
    if (!operator || operator.status !== "active") throw new UnauthenticatedError();
    return { operator: toSummary(operator) };
  }
}
