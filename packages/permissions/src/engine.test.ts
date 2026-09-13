import { describe, expect, it } from "vitest";

import { createPermissionSet, missing, satisfies } from "./engine";
import { STORE_ROLE_PERMISSIONS } from "./roles";

describe("permission engine", () => {
  const orderManager = createPermissionSet(STORE_ROLE_PERMISSIONS.order_manager);

  it("grants a single permission the role has", () => {
    expect(satisfies(orderManager, "orders.refund")).toBe(true);
  });

  it("denies a permission the role lacks", () => {
    expect(satisfies(orderManager, "themes.publish")).toBe(false);
  });

  it("evaluates allOf and anyOf recursively", () => {
    expect(satisfies(orderManager, { allOf: ["orders.read", "orders.write"] })).toBe(true);
    expect(satisfies(orderManager, { allOf: ["orders.read", "themes.publish"] })).toBe(false);
    expect(satisfies(orderManager, { anyOf: ["themes.publish", "quotes.write"] })).toBe(true);
  });

  it("reports missing permissions", () => {
    expect(missing(orderManager, { allOf: ["orders.read", "themes.publish"] })).toEqual([
      "themes.publish",
    ]);
  });
});

describe("built-in roles", () => {
  it("store_owner holds every store permission", () => {
    const owner = createPermissionSet(STORE_ROLE_PERMISSIONS.store_owner);
    expect(satisfies(owner, { allOf: ["users.manage", "themes.publish", "orders.refund"] })).toBe(
      true,
    );
  });

  it("viewer holds only read permissions", () => {
    expect(STORE_ROLE_PERMISSIONS.viewer.every((p) => p.endsWith(".read"))).toBe(true);
  });
});
