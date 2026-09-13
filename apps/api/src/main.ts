import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";

import { AppModule } from "./app.module";
import type { Env } from "./config/env";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService<Env, true>);
  const logger = new Logger("Bootstrap");

  app.use(helmet());
  app.enableCors({
    origin: config.get("API_CORS_ORIGINS", { infer: true }),
    credentials: true,
  });
  app.enableShutdownHooks();

  const port = config.get("API_PORT", { infer: true });
  await app.listen(port);
  logger.log(`Ocean API listening on http://localhost:${port}`);
}

void bootstrap();
