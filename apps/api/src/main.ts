import "reflect-metadata";

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

export function configureApp(app: NestExpressApplication, corsOrigins: string[]): void {
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cookieParser());
  app.use(requestIdMiddleware);
  app.enableCors({ origin: corsOrigins, credentials: true });
  app.setGlobalPrefix(ADMIN_API_PREFIX, { exclude: ["health", "health/ready"] });
  app.enableShutdownHooks();
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService<Env, true>);
  const logger = new Logger("Bootstrap");

  configureApp(app, config.get("API_CORS_ORIGINS", { infer: true }));

  const port = config.get("API_PORT", { infer: true });
  await app.listen(port);
  logger.log(`Ocean API listening on http://localhost:${port}/${ADMIN_API_PREFIX}`);
}

if (require.main === module) {
  void bootstrap();
}
