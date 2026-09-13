import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";

import { SessionGuard } from "./common/auth/session.guard";
import { ApiErrorFilter } from "./common/errors/api-error.filter";
import { ResponseEnvelopeInterceptor } from "./common/http/response-envelope.interceptor";
import { PermissionGuard } from "./common/tenant/permission.guard";
import { TenantModule } from "./common/tenant/tenant.module";
import { validateEnv } from "./config/env";
import { HealthModule } from "./health/health.module";
import { MailModule } from "./infrastructure/mail/mail.module";
import { PrismaModule } from "./infrastructure/prisma/prisma.module";
import { RedisModule } from "./infrastructure/redis/redis.module";
import { AuditModule } from "./modules/audit/audit.module";
import { AuthModule } from "./modules/auth/auth.module";
import { MembershipsModule } from "./modules/memberships/memberships.module";
import { OrganizationsModule } from "./modules/organizations/organizations.module";
import { StoresModule } from "./modules/stores/stores.module";
import { UsersModule } from "./modules/users/users.module";

// Domain modules are registered flat and talk to each other only through exported services.
// Guard order: SessionGuard (who) → PermissionGuard (which tenant, which permission).
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ["../../.env", ".env"],
    }),
    PrismaModule,
    RedisModule,
    MailModule,
    TenantModule,
    AuditModule,
    HealthModule,
    UsersModule,
    AuthModule,
    OrganizationsModule,
    StoresModule,
    MembershipsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_FILTER, useClass: ApiErrorFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
  ],
})
export class AppModule {}
