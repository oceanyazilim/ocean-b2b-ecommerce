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
import { StorageModule } from "./infrastructure/storage/storage.module";
import { AuditModule } from "./modules/audit/audit.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CategoriesModule } from "./modules/catalog/categories/categories.module";
import { CollectionsModule } from "./modules/catalog/collections/collections.module";
import { MetafieldsModule } from "./modules/catalog/metafields/metafields.module";
import { ProductsModule } from "./modules/catalog/products/products.module";
import { EventsModule } from "./modules/events/events.module";
import { CatalogsModule } from "./modules/catalogs/catalogs.module";
import { CompaniesModule } from "./modules/companies/companies.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { MediaModule } from "./modules/media/media.module";
import { MembershipsModule } from "./modules/memberships/memberships.module";
import { PricingModule } from "./modules/pricing/pricing.module";
import { OrdersModule } from "./modules/orders/orders.module";
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
    StorageModule,
    EventsModule,
    TenantModule,
    AuditModule,
    HealthModule,
    UsersModule,
    AuthModule,
    OrganizationsModule,
    StoresModule,
    MembershipsModule,
    MediaModule,
    MetafieldsModule,
    CategoriesModule,
    CollectionsModule,
    ProductsModule,
    InventoryModule,
    CustomersModule,
    CompaniesModule,
    CatalogsModule,
    PricingModule,
    OrdersModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_FILTER, useClass: ApiErrorFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
  ],
})
export class AppModule {}
