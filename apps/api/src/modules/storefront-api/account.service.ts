import { Injectable } from "@nestjs/common";
import type { CompanyPermission } from "@ocean/permissions";
import { satisfies } from "@ocean/permissions";
import type {
  AddCompanyUserInput,
  CompanyDetail,
  CompanyUserSummary,
  CreditAccountSummary,
  CustomerAddressInput,
  CustomerAddressSummary,
  CustomerDetail,
  InvoiceDetail,
  InvoiceListQuery,
  InvoiceSummary,
  OrderDetail,
  OrderListQuery,
  OrderSummary,
  Paginated,
  QuoteDetail,
  QuoteListQuery,
  QuoteSummary,
  UpdateCompanyUserInput,
  UpdateCustomerAddressInput,
} from "@ocean/types";

import { ForbiddenError, NotFoundError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { companyPermissionsFor, isMembershipUsable, type CompanyMembershipFacts } from "../companies/company-access";
import { CompaniesService } from "../companies/companies.service";
import { CompanyUsersService } from "../companies/company-users.service";
import { CreditService } from "../credit/credit.service";
import { CustomersService } from "../customers/customers.service";
import { FinanceService } from "../finance/finance.service";
import { OrdersService } from "../orders/orders.service";
import { QuotesService } from "../quotes/quotes.service";

export interface AccountMembership {
  companyUserId: string;
  companyId: string;
  companyName: string;
  facts: CompanyMembershipFacts;
}

// Buyer-facing wrapper around the admin-side services (Quotes/Finance/Credit/Companies/Orders),
// scoped to "the signed-in customer's own company" instead of "any company in this org/store".
// No business logic is duplicated here — every read/write below calls straight into the same
// service the admin controllers use; this class only resolves who's asking (loadMembership) and
// narrows the query/asserts ownership before/after calling through.
@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly quotes: QuotesService,
    private readonly finance: FinanceService,
    private readonly credit: CreditService,
    private readonly companies: CompaniesService,
    private readonly companyUsers: CompanyUsersService,
    private readonly customers: CustomersService,
  ) {}

  // A customer can belong to more than one company (CompanyUser is many-to-one from Customer),
  // but the storefront's own session model is already single-company (see
  // CustomerAuthService.toStorefrontCustomer, which does the same findFirst) — the buyer portal
  // mirrors that scope cut rather than inventing a company-switcher.
  async loadMembership(tenant: TenantContext, customerId: string): Promise<AccountMembership | null> {
    const row = await this.prisma.companyUser.findFirst({
      where: {
        customerId,
        storeId: tenant.storeId as string,
        organizationId: tenant.organizationId,
        status: "active",
      },
      include: {
        company: { select: { displayName: true, status: true } },
        customer: { select: { status: true } },
        locations: { select: { companyLocationId: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    if (!row) return null;
    const facts: CompanyMembershipFacts = {
      status: row.status,
      role: row.role,
      allLocations: row.allLocations,
      locationIds: row.locations.map((l) => l.companyLocationId),
      companyStatus: row.company.status,
      customerStatus: row.customer.status,
    };
    if (!isMembershipUsable(facts)) return null;
    return {
      companyUserId: row.id,
      companyId: row.companyId,
      companyName: row.company.displayName,
      facts,
    };
  }

  private requireMembership(membership: AccountMembership | null): AccountMembership {
    if (!membership) {
      throw new ForbiddenError("This account isn't linked to a company yet.");
    }
    return membership;
  }

  // There's no dedicated "company.credit.read" permission in @ocean/permissions today — credit
  // exposure is money-sensitive the same way invoices are, so it's gated on "company.invoices.read"
  // (granted to company_admin and finance roles) rather than widening the shared permission enum
  // for this one buyer-portal screen.
  private requirePermission(membership: AccountMembership, permission: CompanyPermission) {
    const granted = companyPermissionsFor(membership.facts);
    if (!satisfies(granted, permission)) {
      throw new ForbiddenError("You do not have permission to see this.");
    }
  }

  async getProfile(tenant: TenantContext, customerId: string): Promise<CustomerDetail> {
    return this.customers.get(tenant, customerId);
  }

  // ---- orders -----------------------------------------------------------------------------

  async listOrders(
    tenant: TenantContext,
    customerId: string,
    membership: AccountMembership | null,
    query: { status?: OrderListQuery["status"]; open?: boolean; limit: number; cursor?: string },
  ): Promise<Paginated<OrderSummary>> {
    const scoped: OrderListQuery = {
      limit: query.limit,
      cursor: query.cursor,
      status: query.status,
      open: query.open,
      sort: "created_desc",
      // A company buyer sees every order placed for their company; an individual (no company
      // membership) sees only orders placed under their own customer id.
      ...(membership ? { companyId: membership.companyId } : { customerId }),
    };
    return this.orders.list(tenant, scoped);
  }

  async getOrder(
    tenant: TenantContext,
    customerId: string,
    membership: AccountMembership | null,
    id: string,
  ): Promise<OrderDetail> {
    const order = await this.orders.get(tenant, id);
    const owns = membership
      ? order.buyer.company?.id === membership.companyId
      : order.buyer.customer?.id === customerId;
    // 404, not 403: a buyer must not learn that some other company's order id exists at all.
    if (!owns) throw new NotFoundError("Order");
    return order;
  }

  // ---- quotes -----------------------------------------------------------------------------

  async listQuotes(
    tenant: TenantContext,
    membership: AccountMembership | null,
    query: { status?: QuoteListQuery["status"]; limit: number; cursor?: string },
  ): Promise<Paginated<QuoteSummary>> {
    const m = this.requireMembership(membership);
    return this.quotes.list(tenant, {
      limit: query.limit,
      cursor: query.cursor,
      status: query.status,
      companyId: m.companyId,
    });
  }

  async getQuote(tenant: TenantContext, membership: AccountMembership | null, id: string): Promise<QuoteDetail> {
    const m = this.requireMembership(membership);
    const quote = await this.quotes.get(tenant, id);
    if (quote.companyId !== m.companyId) throw new NotFoundError("Quote");
    return quote;
  }

  // ---- invoices ---------------------------------------------------------------------------

  async listInvoices(
    tenant: TenantContext,
    membership: AccountMembership | null,
    query: { status?: InvoiceListQuery["status"]; limit: number; cursor?: string },
  ): Promise<Paginated<InvoiceSummary>> {
    const m = this.requireMembership(membership);
    this.requirePermission(m, "company.invoices.read");
    return this.finance.list(tenant, {
      limit: query.limit,
      cursor: query.cursor,
      status: query.status,
      companyId: m.companyId,
    });
  }

  async getInvoice(tenant: TenantContext, membership: AccountMembership | null, id: string): Promise<InvoiceDetail> {
    const m = this.requireMembership(membership);
    this.requirePermission(m, "company.invoices.read");
    const invoice = await this.finance.get(tenant, id);
    if (invoice.companyId !== m.companyId) throw new NotFoundError("Invoice");
    return invoice;
  }

  // ---- credit -------------------------------------------------------------------------------

  // Company-level accounts only — a location-scoped CreditAccount isn't surfaced here. Buyers
  // get one "available credit" number for their company, not a per-location ledger; the admin
  // side (CreditController) remains the place to manage location accounts.
  async listCredit(
    tenant: TenantContext,
    membership: AccountMembership | null,
  ): Promise<CreditAccountSummary[]> {
    const m = this.requireMembership(membership);
    this.requirePermission(m, "company.invoices.read");
    const accounts = await this.credit.list(tenant);
    return accounts.filter((a) => a.companyId === m.companyId);
  }

  // ---- company profile --------------------------------------------------------------------

  async getCompany(tenant: TenantContext, membership: AccountMembership | null): Promise<CompanyDetail> {
    const m = this.requireMembership(membership);
    return this.companies.get(tenant, m.companyId);
  }

  // ---- team -------------------------------------------------------------------------------

  async listTeam(tenant: TenantContext, membership: AccountMembership | null): Promise<CompanyUserSummary[]> {
    const m = this.requireMembership(membership);
    this.requirePermission(m, "company.members.manage");
    return this.companyUsers.list(tenant, m.companyId);
  }

  async inviteTeamMember(
    tenant: TenantContext,
    membership: AccountMembership | null,
    input: AddCompanyUserInput,
    meta: RequestMeta,
  ): Promise<CompanyUserSummary> {
    const m = this.requireMembership(membership);
    this.requirePermission(m, "company.members.manage");
    return this.companyUsers.add(tenant, m.companyId, input, meta);
  }

  async updateTeamMember(
    tenant: TenantContext,
    membership: AccountMembership | null,
    id: string,
    input: UpdateCompanyUserInput,
    meta: RequestMeta,
  ): Promise<CompanyUserSummary> {
    const m = this.requireMembership(membership);
    this.requirePermission(m, "company.members.manage");
    return this.companyUsers.update(tenant, m.companyId, id, input, meta);
  }

  async removeTeamMember(
    tenant: TenantContext,
    membership: AccountMembership | null,
    id: string,
    meta: RequestMeta,
  ): Promise<void> {
    const m = this.requireMembership(membership);
    this.requirePermission(m, "company.members.manage");
    await this.companyUsers.remove(tenant, m.companyId, id, meta);
  }

  // ---- addresses (personal to the signed-in customer, no company scoping needed) ----------

  async listAddresses(tenant: TenantContext, customerId: string): Promise<CustomerAddressSummary[]> {
    const detail = await this.customers.get(tenant, customerId);
    return detail.addresses;
  }

  async addAddress(
    tenant: TenantContext,
    customerId: string,
    input: CustomerAddressInput,
    meta: RequestMeta,
  ): Promise<CustomerAddressSummary[]> {
    const detail = await this.customers.addAddress(tenant, customerId, input, meta);
    return detail.addresses;
  }

  async updateAddress(
    tenant: TenantContext,
    customerId: string,
    addressId: string,
    input: UpdateCustomerAddressInput,
    meta: RequestMeta,
  ): Promise<CustomerAddressSummary[]> {
    const detail = await this.customers.updateAddress(tenant, customerId, addressId, input, meta);
    return detail.addresses;
  }

  async removeAddress(
    tenant: TenantContext,
    customerId: string,
    addressId: string,
    meta: RequestMeta,
  ): Promise<CustomerAddressSummary[]> {
    const detail = await this.customers.removeAddress(tenant, customerId, addressId, meta);
    return detail.addresses;
  }
}
