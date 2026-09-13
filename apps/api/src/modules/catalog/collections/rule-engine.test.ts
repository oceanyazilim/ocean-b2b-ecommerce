import { describe, expect, it } from "vitest";

import { matchesRule, matchesRules, type RuleProduct } from "./rule-engine";

const glove: RuleProduct = {
  title: "Industrial Glove XL",
  productType: "Gloves",
  vendor: "ACME Safety",
  tags: ["ppe", "hands", "Winter"],
  status: "active",
  categoryPath: "safety/hand-protection",
  minPrice: 9200,
};

describe("matchesRule", () => {
  it("compares text fields case-insensitively", () => {
    expect(matchesRule(glove, { field: "title", operator: "contains", value: "glove" })).toBe(true);
    expect(matchesRule(glove, { field: "vendor", operator: "starts_with", value: "acme" })).toBe(
      true,
    );
    expect(
      matchesRule(glove, { field: "product_type", operator: "not_equals", value: "Gloves" }),
    ).toBe(false);
  });

  it("matches any tag and negates correctly", () => {
    expect(matchesRule(glove, { field: "tag", operator: "equals", value: "winter" })).toBe(true);
    expect(matchesRule(glove, { field: "tag", operator: "not_equals", value: "winter" })).toBe(
      false,
    );
    expect(matchesRule(glove, { field: "tag", operator: "contains", value: "and" })).toBe(true);
  });

  it("compares prices in major units against minor-unit storage", () => {
    expect(matchesRule(glove, { field: "price", operator: "gt", value: "90" })).toBe(true);
    expect(matchesRule(glove, { field: "price", operator: "lte", value: "92" })).toBe(true);
    expect(matchesRule(glove, { field: "price", operator: "lt", value: "92" })).toBe(false);
    expect(
      matchesRule({ ...glove, minPrice: null }, { field: "price", operator: "gt", value: "0" }),
    ).toBe(false);
  });

  it("treats category equals as subtree match", () => {
    expect(matchesRule(glove, { field: "category", operator: "equals", value: "safety" })).toBe(
      true,
    );
    expect(matchesRule(glove, { field: "category", operator: "equals", value: "safety/eye" })).toBe(
      false,
    );
  });
});

describe("matchesRules", () => {
  const rules = [
    { field: "tag" as const, operator: "equals" as const, value: "ppe" },
    { field: "price" as const, operator: "gt" as const, value: "100" },
  ];
  it("supports all / any", () => {
    expect(matchesRules(glove, rules, true)).toBe(false);
    expect(matchesRules(glove, rules, false)).toBe(true);
    expect(matchesRules(glove, [], false)).toBe(false);
  });
});
