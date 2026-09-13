import { PrismaClient } from "../generated/client";

export * from "../generated/client";

declare global {
  // Reused across hot reloads in dev so we don't exhaust Postgres connections.
  var __oceanPrisma: PrismaClient | undefined;
}

export function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma: PrismaClient = globalThis.__oceanPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__oceanPrisma = prisma;
}
