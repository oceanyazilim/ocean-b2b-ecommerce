import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { AppModule } from "../app.module";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import { QuotesService } from "../modules/quotes/quotes.service";
import { CreditService } from "../modules/credit/credit.service";
import { ApprovalsService } from "../modules/approvals/approvals.service";
import { FinanceService } from "../modules/finance/finance.service";
import { DiscountsService } from "../modules/discounts/discounts.service";
import { SavedListsService } from "../modules/saved-lists/saved-lists.service";
import { TenantContext } from "../common/tenant/tenant-context";

describe("B2B Modules Integration", () => {
  let app: TestingModule;
  let prisma: PrismaService;
  
  let quotesService: QuotesService;
  let creditService: CreditService;
  let approvalsService: ApprovalsService;
  let financeService: FinanceService;
  let discountsService: DiscountsService;
  let savedListsService: SavedListsService;
  
  let storeId: string;
  let organizationId: string;
  let companyId: string;
  let customerId: string;
  let tenant: TenantContext;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    prisma = app.get<PrismaService>(PrismaService);
    quotesService = app.get(QuotesService);
    creditService = app.get(CreditService);
    approvalsService = app.get(ApprovalsService);
    financeService = app.get(FinanceService);
    discountsService = app.get(DiscountsService);
    savedListsService = app.get(SavedListsService);

    // Setup Test Data
    const org = await prisma.organization.create({
      data: { name: "Test Org B2B", slug: "test-org-b2b-" + Date.now() }
    });
    organizationId = org.id;

    const store = await prisma.store.create({
      data: { name: "Test Store B2B", slug: "test-store-" + Date.now(), organizationId, defaultCurrency: "USD", defaultLocale: "en", timezone: "UTC" }
    });
    storeId = store.id;

    const customer = await prisma.customer.create({
      data: { storeId, organizationId, email: "test-b2b@example.com", firstName: "Test", lastName: "B2B", passwordHash: "x" }
    });
    customerId = customer.id;

    const company = await prisma.company.create({
      data: { storeId, organizationId, legalName: "Acme B2B Corp", displayName: "Acme", currency: "USD" }
    });
    companyId = company.id;

    tenant = {
      storeId,
      organizationId,
      actor: { type: "customer", id: customerId },
      organizationRole: "owner",
      storeRole: "admin",
      organizationPermissions: ["quotes.write", "credit.write", "approvals.write", "finance.write", "discounts.write", "saved_lists.write"],
      storePermissions: ["quotes.write", "credit.write", "approvals.write", "finance.write", "discounts.write", "saved_lists.write"],
      requestId: "test-req-1"
    } as unknown as TenantContext;
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await app.close();
  });

  it("should create and list a quote", async () => {
    const quote = await quotesService.create(tenant, {
      companyId,
      customerId,
      currency: "USD",
      items: []
    });
    expect(quote).toBeDefined();
    expect(quote.number).toMatch(/^QT-/);

    const list = await quotesService.list(tenant);
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]!.id).toBe(quote.id);
  });

  it("should create and list a credit account", async () => {
    const account = await creditService.create(tenant, {
      companyId,
      limit: 10000,
      currency: "USD",
      onExceedPolicy: "reject",
    });
    expect(account).toBeDefined();

    const list = await creditService.list(tenant);
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]!.id).toBe(account.id);
  });

  it("should create and list an approval rule", async () => {
    const rule = await approvalsService.create(tenant, {
      companyId,
      conditions: { minAmount: 500 },
      approverRoles: ["admin"]
    });
    expect(rule).toBeDefined();

    const list = await approvalsService.list(tenant);
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]!.id).toBe(rule.id);
  });

  it("should create and list an invoice", async () => {
    const order = await prisma.order.create({
      data: {
        storeId,
        organizationId,
        customerId,
        number: 1,
        name: "#ORD-TEST-1",
        currency: "USD",
        subtotal: 1000,
        total: 1000,
        taxTotal: 0,
        discountTotal: 0,
        status: "confirmed",
        paymentStatus: "pending",
        fulfillmentStatus: "unfulfilled",
        source: "storefront",
        itemCount: 1
      }
    });

    const invoice = await financeService.create(tenant, {
      orderId: order.id,
      companyId,
      dueAt: new Date().toISOString(),
      amount: 1000,
    });
    expect(invoice).toBeDefined();

    const list = await financeService.list(tenant);
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]!.id).toBe(invoice.id);
  });

  it("should create and list a discount", async () => {
    const discount = await discountsService.create(tenant, {
      type: "percentage",
      method: "code",
      value: { percent: 10 },
      startsAt: new Date().toISOString(),
    });
    expect(discount).toBeDefined();

    const list = await discountsService.list(tenant);
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]!.id).toBe(discount.id);
  });

  it("should create and list a saved list", async () => {
    const list = await savedListsService.create(tenant, {
      name: "My favorites",
      customerId,
      companyId,
      items: []
    });
    expect(list).toBeDefined();

    const lists = await savedListsService.list(tenant);
    expect(lists.length).toBeGreaterThan(0);
    expect(lists[0]!.id).toBe(list.id);
  });
});
