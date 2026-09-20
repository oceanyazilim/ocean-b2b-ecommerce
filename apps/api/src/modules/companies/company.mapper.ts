import type { Prisma } from "@ocean/db";
import type {
  Address,
  CompanyDetail,
  CompanyLocationSummary,
  CompanyRole,
  CompanyStatus,
  CompanySummary,
  CompanyUserStatus,
  CompanyUserSummary,
  CustomerStatus,
  TaxIdValidationStatus,
} from "@ocean/types";

import { customerDisplayName } from "../customers/customer.mapper";

const accountManagerSelect = { select: { id: true, name: true, email: true } } as const;

export const companySummaryInclude = {
  accountManager: accountManagerSelect,
  locations: {
    where: { isDefault: true },
    take: 1,
    select: { id: true, name: true, shippingAddress: true },
  },
  _count: {
    select: {
      locations: true,
      users: { where: { status: "active", customer: { deletedAt: null } } },
    },
  },
} satisfies Prisma.CompanyInclude;

export const companyLocationInclude = {
  _count: { select: { userAccess: true } },
} satisfies Prisma.CompanyLocationInclude;

export const companyDetailInclude = {
  accountManager: accountManagerSelect,
  locations: {
    orderBy: [
      { isDefault: "desc" as const },
      { isActive: "desc" as const },
      { name: "asc" as const },
    ],
    include: companyLocationInclude,
  },
  _count: {
    select: {
      locations: true,
      users: { where: { status: "active", customer: { deletedAt: null } } },
    },
  },
} satisfies Prisma.CompanyInclude;

export const companyUserInclude = {
  customer: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      status: true,
      accountActivatedAt: true,
    },
  },
  locations: {
    include: { location: { select: { id: true, name: true } } },
    orderBy: { location: { name: "asc" as const } },
  },
} satisfies Prisma.CompanyUserInclude;

export type CompanySummaryRow = Prisma.CompanyGetPayload<{ include: typeof companySummaryInclude }>;
export type CompanyDetailRow = Prisma.CompanyGetPayload<{ include: typeof companyDetailInclude }>;
export type CompanyLocationRow = Prisma.CompanyLocationGetPayload<{
  include: typeof companyLocationInclude;
}>;
export type CompanyUserRow = Prisma.CompanyUserGetPayload<{ include: typeof companyUserInclude }>;

export function toCompanySummary(row: CompanySummaryRow): CompanySummary {
  const def = row.locations[0];
  const address = def ? (def.shippingAddress as unknown as Address) : null;
  return {
    id: row.id,
    legalName: row.legalName,
    displayName: row.displayName,
    taxNumber: row.taxNumber,
    industry: row.industry,
    currency: row.currency,
    status: row.status as CompanyStatus,
    externalId: row.externalId,
    tags: row.tags,
    accountManager: row.accountManager,
    locationCount: row._count.locations,
    userCount: row._count.users,
    defaultLocation:
      def && address
        ? { id: def.id, name: def.name, city: address.city, countryCode: address.countryCode }
        : null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// `allLocationUsers` = active members who may act at every location; added to each
// location's explicit assignment count.
export function toCompanyLocationSummary(
  row: CompanyLocationRow,
  allLocationUsers = 0,
): CompanyLocationSummary {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    externalId: row.externalId,
    phone: row.phone,
    email: row.email,
    shippingAddress: row.shippingAddress as unknown as Address,
    billingAddress: (row.billingAddress as unknown as Address | null) ?? null,
    currency: row.currency,
    taxExempt: row.taxExempt,
    taxNumber: row.taxNumber,
    isDefault: row.isDefault,
    isActive: row.isActive,
    note: row.note,
    userCount: row._count.userAccess + allLocationUsers,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toCompanyDetail(row: CompanyDetailRow, allLocationUsers: number): CompanyDetail {
  const summary = toCompanySummary({
    ...row,
    locations: row.locations.filter((l) => l.isDefault).slice(0, 1),
  });
  return {
    ...summary,
    taxOffice: row.taxOffice,
    website: row.website,
    phone: row.phone,
    email: row.email,
    note: row.note,
    locations: row.locations.map((l) => toCompanyLocationSummary(l, allLocationUsers)),
    taxCountryCode: row.taxCountryCode,
    taxIdType: row.taxIdType,
    taxValidationStatus: row.taxValidationStatus as TaxIdValidationStatus,
    taxTreatment: row.taxTreatment,
    // Resolved by CompaniesService.withTaxIdLabel (needs an async CountryProfile lookup, which
    // a pure mapper can't do) — placeholder here so this stays type-complete on its own.
    taxIdLabel: null,
  };
}

export function toCompanyUserSummary(row: CompanyUserRow): CompanyUserSummary {
  return {
    id: row.id,
    companyId: row.companyId,
    customer: {
      id: row.customer.id,
      email: row.customer.email,
      displayName: customerDisplayName(row.customer),
      status: row.customer.status as CustomerStatus,
      hasAccount: row.customer.accountActivatedAt !== null,
    },
    role: row.role as CompanyRole,
    status: row.status as CompanyUserStatus,
    title: row.title,
    allLocations: row.allLocations,
    locations: row.locations.map((l) => ({ id: l.location.id, name: l.location.name })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
