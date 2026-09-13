import { randomBytes } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { PrismaClient } from "@ocean/db";
import Redis from "ioredis";
import request from "supertest";

import { AppModule } from "../app.module";
import { ConsoleMailAdapter } from "../infrastructure/mail/console-mail.adapter";
import { configureApp } from "../main";

// Integration tests need real Postgres + Redis and are opt-in via OCEAN_INTEGRATION=1
// (`pnpm test:integration`; CI sets it). Checking DATABASE_URL alone is not enough because
// Nest's ConfigModule loads .env into process.env as soon as AppModule is imported.
export const INTEGRATION_ENABLED = process.env.OCEAN_INTEGRATION === "1";

export async function assertInfraReachable(): Promise<void> {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL as string, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  try {
    await Promise.race([
      Promise.all([prisma.$queryRaw`SELECT 1`, redis.connect().then(() => redis.ping())]),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout after 3s")), 3000)),
    ]);
  } catch (error) {
    throw new Error(
      `Integration tests need Postgres and Redis (DATABASE_URL / REDIS_URL are set but unreachable): ${String(error)}`,
    );
  } finally {
    await prisma.$disconnect();
    redis.disconnect();
  }
}

export interface TestApp {
  app: INestApplication;
  http: () => request.Agent;
  mail: ConsoleMailAdapter;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app, []);
  await app.init();
  return {
    app,
    http: () => request.agent(app.getHttpServer()),
    mail: app.get(ConsoleMailAdapter),
    close: () => app.close(),
  };
}

export function uniqueEmail(prefix = "user"): string {
  return `${prefix}-${randomBytes(6).toString("hex")}@test.local`;
}

export function linkToken(text: string | undefined, param: "token" | "invitations"): string {
  if (!text) throw new Error("No mail was sent");
  const match =
    param === "token" ? /[?&]token=([^\s&]+)/.exec(text) : /\/invitations\/([^\s]+)/.exec(text);
  if (!match?.[1]) throw new Error(`No ${param} found in mail text`);
  return decodeURIComponent(match[1]);
}

export const PASSWORD = "CorrectHorse!42";

export async function signupVerified(
  t: TestApp,
  agent: request.Agent,
  email = uniqueEmail(),
): Promise<{ email: string; userId: string }> {
  const res = await agent
    .post("/admin/v1/auth/signup")
    .send({ email, name: "Test User", password: PASSWORD })
    .expect(201);
  const token = linkToken(t.mail.lastTo(email)?.text, "token");
  await agent.post("/admin/v1/auth/verify-email").send({ token }).expect(200);
  return { email, userId: res.body.data.user.id as string };
}

export async function createOrgAndStore(
  agent: request.Agent,
  name = "Acme",
): Promise<{ organizationId: string; storeId: string }> {
  const org = await agent.post("/admin/v1/organizations").send({ name }).expect(201);
  const organizationId = org.body.data.id as string;
  const store = await agent
    .post(`/admin/v1/organizations/${organizationId}/stores`)
    .send({
      name: `${name} Store`,
      defaultCurrency: "TRY",
      defaultLocale: "tr",
      timezone: "Europe/Istanbul",
    })
    .expect(201);
  return { organizationId, storeId: store.body.data.id as string };
}
