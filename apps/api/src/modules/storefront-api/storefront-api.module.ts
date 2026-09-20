import { Module } from "@nestjs/common";

import { CatalogsModule } from "../catalogs/catalogs.module";
import { CompaniesModule } from "../companies/companies.module";
import { ContentModule } from "../content/content.module";
import { CreditModule } from "../credit/credit.module";
import { CustomersModule } from "../customers/customers.module";
import { FinanceModule } from "../finance/finance.module";
import { InventoryModule } from "../inventory/inventory.module";
import { LocalizationModule } from "../localization/localization.module";
import { MarketsModule } from "../markets/markets.module";
import { OrdersModule } from "../orders/orders.module";
import { PaymentsModule } from "../payments/payments.module";
import { PricingModule } from "../pricing/pricing.module";
import { QuotesModule } from "../quotes/quotes.module";
import { ThemesModule } from "../themes/themes.module";
import { UsersModule } from "../users/users.module";
import { AccountController } from "./account.controller";
import { AccountService } from "./account.service";
import { CustomerAuthController } from "./customer-auth.controller";
import { CustomerAuthService } from "./customer-auth.service";
import { StorefrontCartController } from "./storefront-cart.controller";
import { StorefrontCatalogService } from "./storefront-catalog.service";
import { StorefrontController } from "./storefront.controller";

@Module({
  imports: [
    CatalogsModule,
    PricingModule,
    InventoryModule,
    OrdersModule,
    ContentModule,
    MarketsModule,
    LocalizationModule,
    PaymentsModule,
    ThemesModule,
    UsersModule,
    QuotesModule,
    FinanceModule,
    CreditModule,
    CompaniesModule,
    CustomersModule,
  ],
  controllers: [
    StorefrontController,
    CustomerAuthController,
    StorefrontCartController,
    AccountController,
  ],
  providers: [StorefrontCatalogService, CustomerAuthService, AccountService],
})
export class StorefrontApiModule {}
