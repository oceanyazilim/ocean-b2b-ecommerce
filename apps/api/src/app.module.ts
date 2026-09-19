import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";

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
import { MarketsModule } from "./modules/markets/markets.module";
import { ContentModule } from "./modules/content/content.module";
import { DomainsModule } from "./modules/domains/domains.module";
import { StorefrontApiModule } from "./modules/storefront-api/storefront-api.module";
import { ThemesModule } from "./modules/themes/themes.module";
import { QuotesModule } from "./modules/quotes/quotes.module";
import { CreditModule } from "./modules/credit/credit.module";
import { ApprovalsModule } from "./modules/approvals/approvals.module";
import { FinanceModule } from "./modules/finance/finance.module";
import { DiscountsModule } from "./modules/discounts/discounts.module";
import { SavedListsModule } from "./modules/saved-lists/saved-lists.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { BillingModule } from "./modules/billing/billing.module";
import { DevelopersModule } from "./modules/developers/developers.module";
import { CustomRolesModule } from "./modules/custom-roles/custom-roles.module";
import { SsoModule } from "./modules/sso/sso.module";
import { SupportModule } from "./modules/support/support.module";

// Domain modules are registered flat and talk to each other only through exported services.
// Guard order: SessionGuard (who) → PermissionGuard (which tenant, which permission).
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ["../../.env", ".env"],
    }),
    ScheduleModule.forRoot(),
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
    MarketsModule,
    ContentModule,
    DomainsModule,
    StorefrontApiModule,
    ThemesModule,
    QuotesModule,
    CreditModule,
    ApprovalsModule,
    FinanceModule,
    DiscountsModule,
    SavedListsModule,
    AnalyticsModule,
    NotificationsModule,
    BillingModule,
    DevelopersModule,
    CustomRolesModule,
    SsoModule,
    SupportModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_FILTER, useClass: ApiErrorFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
  ],
})
export class AppModule {}
