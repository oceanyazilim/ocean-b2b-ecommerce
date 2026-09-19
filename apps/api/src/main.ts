import "reflect-metadata";

import { isAbsolute, resolve } from "node:path";

import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import helmet from "helmet";

import { AppModule } from "./app.module";
import { requestIdMiddleware } from "./common/http/request-id.middleware";
import type { Env } from "./config/env";

export const ADMIN_API_PREFIX = "admin/v1";

export interface AppOptions {
  corsOrigins: string[];
  // When set, files under this directory are served at /media (local storage driver).
  localMediaDir?: string | undefined;
}

export function configureApp(app: NestExpressApplication, options: AppOptions): void {
  app.set("trust proxy", 1);
  app.use(
    helmet({
      // Media is embedded by admin/storefront pages on other origins.
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.use(cookieParser());
  app.use(requestIdMiddleware);
  app.enableCors({ origin: options.corsOrigins, credentials: true });
  if (options.localMediaDir) {
    app.useStaticAssets(options.localMediaDir, {
      prefix: "/media/",
      maxAge: "365d",
      immutable: true,
      index: false,
      dotfiles: "deny",
    });
  }
  // Storefront routes are versioned under their own /storefront/v1 prefix, and the Phase 15
  // Developer API under its own dated /api/2026-01 prefix (see
  // docs/architecture/09-api-conventions.md) — neither must be nested under /admin/v1 too. The
  // platform-operator surface (apps/platform-admin) lives under its own /platform prefix for the
  // same reason, and additionally never carries admin/v1's merchant-session assumptions.
  app.setGlobalPrefix(ADMIN_API_PREFIX, {
    exclude: ["health", "health/ready", "storefront/(.*)", "api/2026-01/(.*)", "platform/(.*)"],
  });
  app.enableShutdownHooks();
}

export function optionsFromEnv(config: ConfigService<Env, true>): AppOptions {
  const driver = config.get("STORAGE_DRIVER", { infer: true });
  const dir = config.get("STORAGE_LOCAL_DIR", { infer: true });
  return {
    corsOrigins: config.get("API_CORS_ORIGINS", { infer: true }),
    localMediaDir:
      driver === "local" ? (isAbsolute(dir) ? dir : resolve(process.cwd(), dir)) : undefined,
  };
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService<Env, true>);
  const logger = new Logger("Bootstrap");

  configureApp(app, optionsFromEnv(config));

  const port = config.get("API_PORT", { infer: true });
  await app.listen(port);
  logger.log(`Ocean API listening on http://localhost:${port}/${ADMIN_API_PREFIX}`);
}

if (require.main === module) {
  void bootstrap();
}
