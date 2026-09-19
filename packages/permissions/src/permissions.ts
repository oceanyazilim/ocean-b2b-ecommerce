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
  "fulfillments.read",
  "fulfillments.write",
  "returns.read",
  "returns.write",
  "shipping.read",
  "shipping.write",
  "payments.read",
  "payments.write",
  "taxes.read",
  "taxes.write",
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
  "credit.read",
  "credit.write",
  "approvals.read",
  "approvals.write",
  "savedLists.read",
  "savedLists.write",
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

const STORE_ONLY = new Set<string>(STORE_PERMISSIONS);

// Narrower than isPermission(): true only for a StorePermission, not any organization/company
// permission too. Store-scoped grants (a CustomRole, an ApiKey/DeveloperApp's scopes) must be
// validated against this, not the full Permission union — an org-level string like
// "organization.billing" or "stores.delete" has no meaning attached to a single store.
export function isStorePermission(value: string): value is StorePermission {
  return STORE_ONLY.has(value);
}
