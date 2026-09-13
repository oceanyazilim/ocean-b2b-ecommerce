// Single source of truth for permission strings. UI and API both import from here;
// neither is allowed to invent permission literals inline.

export const STORE_PERMISSIONS = [
  "products.read",
  "products.write",
  "products.delete",
  "collections.read",
  "collections.write",
  "inventory.read",
  "inventory.write",
  "orders.read",
  "orders.write",
  "orders.refund",
  "customers.read",
  "customers.write",
  "companies.read",
  "companies.write",
  "catalogs.read",
  "catalogs.write",
  "pricing.read",
  "pricing.write",
  "quotes.read",
  "quotes.write",
  "finance.read",
  "finance.write",
  "discounts.read",
  "discounts.write",
  "content.read",
  "content.write",
  "themes.read",
  "themes.edit",
  "themes.publish",
  "domains.write",
  "analytics.read",
  "apps.install",
  "settings.read",
  "settings.write",
  "users.manage",
] as const;

export type StorePermission = (typeof STORE_PERMISSIONS)[number];

export const ORGANIZATION_PERMISSIONS = [
  "organization.read",
  "organization.write",
  "organization.billing",
  "organization.members.manage",
  "stores.create",
  "stores.delete",
] as const;

export type OrganizationPermission = (typeof ORGANIZATION_PERMISSIONS)[number];

export const COMPANY_PERMISSIONS = [
  "company.read",
  "company.write",
  "company.members.manage",
  "company.orders.create",
  "company.orders.approve",
  "company.quotes.create",
  "company.invoices.read",
] as const;

export type CompanyPermission = (typeof COMPANY_PERMISSIONS)[number];

export type Permission = StorePermission | OrganizationPermission | CompanyPermission;

const ALL = new Set<string>([
  ...STORE_PERMISSIONS,
  ...ORGANIZATION_PERMISSIONS,
  ...COMPANY_PERMISSIONS,
]);

export function isPermission(value: string): value is Permission {
  return ALL.has(value);
}
