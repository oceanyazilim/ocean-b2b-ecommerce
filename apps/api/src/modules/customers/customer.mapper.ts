import type { Prisma } from "@ocean/db";
import type {
  Address,
  CustomerAddressSummary,
  CustomerDetail,
  CustomerStatus,
  CustomerSummary,
  MarketingConsent,
} from "@ocean/types";

import { toMoney } from "../catalog/money";

export const customerSummaryInclude = {
  addresses: { where: { isDefaultShipping: true }, take: 1 },
  _count: { select: { companyUsers: { where: { status: "active" } } } },
} satisfies Prisma.CustomerInclude;

export const customerDetailInclude = {
  addresses: { orderBy: [{ isDefaultShipping: "desc" as const }, { createdAt: "asc" as const }] },
  companyUsers: {
    where: { company: { deletedAt: null } },
    orderBy: { createdAt: "asc" as const },
    include: {
      company: { select: { id: true, displayName: true, status: true } },
      locations: { include: { location: { select: { name: true } } } },
    },
  },
  _count: { select: { companyUsers: { where: { status: "active" } } } },
} satisfies Prisma.CustomerInclude;

export type CustomerSummaryRow = Prisma.CustomerGetPayload<{
  include: typeof customerSummaryInclude;
}>;
export type CustomerDetailRow = Prisma.CustomerGetPayload<{
  include: typeof customerDetailInclude;
}>;

export function customerDisplayName(row: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}): string {
  return [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || row.email;
}

export function toAddressSummary(row: {
  id: string;
  address: Prisma.JsonValue;
  isDefaultShipping: boolean;
  isDefaultBilling: boolean;
  createdAt: Date;
  updatedAt: Date;
}): CustomerAddressSummary {
  return {
    id: row.id,
    address: row.address as unknown as Address,
    isDefaultShipping: row.isDefaultShipping,
    isDefaultBilling: row.isDefaultBilling,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toCustomerSummary(row: CustomerSummaryRow, currency: string): CustomerSummary {
  const defaultAddress = row.addresses[0];
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    displayName: customerDisplayName(row),
    phone: row.phone,
    status: row.status as CustomerStatus,
    kind: row._count.companyUsers > 0 ? "company_buyer" : "individual",
    tags: row.tags,
    emailMarketing: row.emailMarketing as MarketingConsent,
    taxExempt: row.taxExempt,
    hasAccount: row.accountActivatedAt !== null,
    ordersCount: row.ordersCount,
    totalSpent: toMoney(row.totalSpent, currency),
    lastOrderAt: row.lastOrderAt?.toISOString() ?? null,
    defaultAddress: defaultAddress ? (defaultAddress.address as unknown as Address) : null,
    companyCount: row._count.companyUsers,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toCustomerDetail(row: CustomerDetailRow, currency: string): CustomerDetail {
  const summary = toCustomerSummary(
    { ...row, addresses: row.addresses.filter((a) => a.isDefaultShipping).slice(0, 1) },
    currency,
  );
  return {
    ...summary,
    note: row.note,
    locale: row.locale,
    emailMarketingUpdatedAt: row.emailMarketingUpdatedAt?.toISOString() ?? null,
    addresses: row.addresses.map(toAddressSummary),
    companies: row.companyUsers.map((cu) => ({
      companyUserId: cu.id,
      companyId: cu.company.id,
      companyName: cu.company.displayName,
      companyStatus: cu.company.status,
      role: cu.role,
      status: cu.status,
      allLocations: cu.allLocations,
      locationNames: cu.locations.map((l) => l.location.name),
    })),
  };
}
