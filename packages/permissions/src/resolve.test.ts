import { describe, expect, it } from "vitest";

import { satisfies } from "./engine";
import { resolveOrganizationPermissions, resolveStorePermissions } from "./resolve";

describe("resolveStorePermissions", () => {
  it("gives organization owners full store permissions without a store membership", () => {
    const set = resolveStorePermissions("owner", null);
    expect(satisfies(set, { allOf: ["users.manage", "themes.publish"] })).toBe(true);
  });

  it("gives organization members nothing at store level on their own", () => {
    expect(resolveStorePermissions("member", null).size).toBe(0);
    expect(resolveStorePermissions("billing", null).size).toBe(0);
  });

  it("unions organization and store roles", () => {
    const set = resolveStorePermissions("member", "viewer");
    expect(satisfies(set, "orders.read")).toBe(true);
    expect(satisfies(set, "orders.write")).toBe(false);
  });

  it("returns an empty set for no roles", () => {
    expect(resolveStorePermissions(null, null).size).toBe(0);
  });
});

describe("resolveOrganizationPermissions", () => {
  it("maps roles to organization permissions", () => {
    expect(satisfies(resolveOrganizationPermissions("billing"), "organization.billing")).toBe(true);
    expect(satisfies(resolveOrganizationPermissions("member"), "stores.create")).toBe(false);
    expect(resolveOrganizationPermissions(null).size).toBe(0);
  });
});
