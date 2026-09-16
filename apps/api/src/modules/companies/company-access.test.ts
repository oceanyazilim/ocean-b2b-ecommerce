import { describe, expect, it } from "vitest";

import {
  accessibleLocationIds,
  canActAtLocation,
  companyPermissionsFor,
  type CompanyMembershipFacts,
} from "./company-access";

const base: CompanyMembershipFacts = {
  status: "active",
  role: "buyer",
  allLocations: false,
  locationIds: ["loc-a"],
  companyStatus: "active",
  customerStatus: "active",
};

describe("company access", () => {
  it("scopes a buyer to the locations they are assigned to", () => {
    expect(canActAtLocation(base, "loc-a", "company.orders.create")).toBe(true);
    expect(canActAtLocation(base, "loc-b", "company.orders.create")).toBe(false);
    expect(accessibleLocationIds(base, ["loc-a", "loc-b"])).toEqual(["loc-a"]);
  });

  it("lets allLocations members act everywhere in the company", () => {
    const admin = { ...base, role: "company_admin" as const, allLocations: true };
    expect(canActAtLocation(admin, "loc-b", "company.orders.approve")).toBe(true);
    expect(accessibleLocationIds(admin, ["loc-a", "loc-b"])).toEqual(["loc-a", "loc-b"]);
  });

  it("keeps role boundaries: a buyer cannot approve, an approver cannot create", () => {
    expect(canActAtLocation(base, "loc-a", "company.orders.approve")).toBe(false);
    const approver = { ...base, role: "approver" as const };
    expect(canActAtLocation(approver, "loc-a", "company.orders.create")).toBe(false);
    expect(canActAtLocation(approver, "loc-a", "company.orders.approve")).toBe(true);
    expect(companyPermissionsFor({ ...base, role: "viewer" })).toEqual(new Set(["company.read"]));
  });

  it("grants nothing when the membership, company or customer is not active", () => {
    for (const facts of [
      { ...base, status: "disabled" as const },
      { ...base, companyStatus: "suspended" as const },
      { ...base, companyStatus: "archived" as const },
      { ...base, customerStatus: "disabled" as const },
    ]) {
      expect(companyPermissionsFor(facts).size).toBe(0);
      expect(canActAtLocation(facts, "loc-a", "company.read")).toBe(false);
      expect(accessibleLocationIds(facts, ["loc-a"])).toEqual([]);
    }
  });
});
