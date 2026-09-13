import { Injectable } from "@nestjs/common";
import type { LoginOutcome, Prisma } from "@ocean/db";
import type { LoginEventSummary } from "@ocean/types";

import type { RequestMeta } from "../../common/http/request-meta";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { deriveRiskFlags, type RiskFlag } from "./login-risk";

const HISTORY_WINDOW = 20;

@Injectable()
export class LoginEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async riskFlagsFor(userId: string, meta: RequestMeta): Promise<RiskFlag[]> {
    const history = await this.prisma.loginEvent.findMany({
      where: { userId, outcome: "success" },
      orderBy: { createdAt: "desc" },
      take: HISTORY_WINDOW,
      select: { ip: true, userAgent: true },
    });
    return deriveRiskFlags(history, { ip: meta.ip, userAgent: meta.userAgent });
  }

  record(
    event: {
      userId: string | null;
      email: string;
      outcome: LoginOutcome;
      riskFlags?: RiskFlag[];
      sessionId?: string | null;
      meta: RequestMeta;
    },
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return tx.loginEvent.create({
      data: {
        userId: event.userId,
        email: event.email.toLowerCase(),
        outcome: event.outcome,
        riskFlags: event.riskFlags ?? [],
        sessionId: event.sessionId ?? null,
        ip: event.meta.ip,
        userAgent: event.meta.userAgent,
      },
    });
  }

  async listForUser(userId: string, limit = 50): Promise<LoginEventSummary[]> {
    const rows = await this.prisma.loginEvent.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      outcome: r.outcome,
      ip: r.ip,
      userAgent: r.userAgent,
      riskFlags: r.riskFlags,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
