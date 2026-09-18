import type { CompanyPermission, OrganizationPermission, StorePermission } from "./permissions";
import { COMPANY_PERMISSIONS, STORE_PERMISSIONS } from "./permissions";

// Built-in roles ship with the platform. Custom roles (Phase 16) are stored per store
// and resolved by the same engine; they are never hard-coded here.

export const STORE_ROLES = [
  "store_owner",
  "admin",
  "store_manager",
  "product_manager",
  "order_manager",
  "marketing",
  "finance",
  "developer",
  "viewer",
] as const;
export type StoreRole = (typeof STORE_ROLES)[number];

export const ORGANIZATION_ROLES = ["owner", "admin", "billing", "member"] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export const COMPANY_ROLES = ["company_admin", "buyer", "approver", "finance", "viewer"] as const;
export type CompanyRole = (typeof COMPANY_ROLES)[number];

const readOnlyStore = STORE_PERMISSIONS.filter((p) => p.endsWith(".read"));

export const STORE_ROLE_PERMISSIONS: Record<StoreRole, readonly StorePermission[]> = {
  store_owner: STORE_PERMISSIONS,
  admin: STORE_PERMISSIONS.filter((p) => p !== "users.manage"),
  store_manager: [
    ...readOnlyStore,
    "products.write",
    "collections.write",
    "inventory.write",
    "orders.write",
    "orders.refund",
    "fulfillments.write",
    "returns.write",
    "customers.write",
    "companies.write",
    "quotes.write",
    "discounts.write",
    "content.write",
  ],
  product_manager: [
    "products.read",
    "products.write",
    "products.delete",
    "collections.read",
    "collections.write",
    "inventory.read",
    "inventory.write",
    "catalogs.read",
    "pricing.read",
  ],
  order_manager: [
    "orders.read",
    "orders.write",
    "orders.refund",
    "fulfillments.read",
    "fulfillments.write",
    "returns.read",
    "returns.write",
    "shipping.read",
    "payments.read",
    "customers.read",
    "companies.read",
    "inventory.read",
    "quotes.read",
    "quotes.write",
  ],
  marketing: [
    "products.read",
    "collections.read",
    "collections.write",
    "discounts.read",
    "discounts.write",
    "content.read",
    "content.write",
    "themes.read",
    "themes.edit",
    "analytics.read",
  ],
  finance: [
    "orders.read",
    "orders.refund",
    "returns.read",
    "payments.read",
    "payments.write",
    "taxes.read",
    "taxes.write",
    "customers.read",
    "companies.read",
    "finance.read",
    "finance.write",
    "analytics.read",
  ],
  developer: [
    ...readOnlyStore,
    "themes.edit",
    "themes.publish",
    "domains.write",
    "apps.install",
    "settings.write",
  ],
  viewer: readOnlyStore,
};

export const ORGANIZATION_ROLE_PERMISSIONS: Record<
  OrganizationRole,
  readonly OrganizationPermission[]
> = {
  owner: [
    "organization.read",
    "organization.write",
    "organization.billing",
    "organization.members.manage",
    "stores.create",
    "stores.delete",
  ],
  admin: [
    "organization.read",
    "organization.write",
    "organization.members.manage",
    "stores.create",
  ],
  billing: ["organization.read", "organization.billing"],
  member: ["organization.read"],
};

export const COMPANY_ROLE_PERMISSIONS: Record<CompanyRole, readonly CompanyPermission[]> = {
  company_admin: COMPANY_PERMISSIONS,
  buyer: ["company.read", "company.orders.create", "company.quotes.create"],
  approver: ["company.read", "company.orders.approve"],
  finance: ["company.read", "company.invoices.read"],
  viewer: ["company.read"],
};
