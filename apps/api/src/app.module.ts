import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { validateEnv } from "./config/env";
import { HealthModule } from "./health/health.module";

// Domain modules (auth, organizations, stores, products, ...) are registered here
// phase by phase. Keep this list flat: modules talk to each other through their
// exported services, never by reaching into another module's internals.
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ["../../.env", ".env"],
    }),
    HealthModule,
  ],
})
export class AppModule {}
