import { describe, expect, it } from "vitest";

import { isRecord, slugify } from "./index";

describe("slugify", () => {
  it("lowercases, strips diacritics and collapses separators", () => {
    expect(slugify("  Endüstriyel Eldiven  XL ")).toBe("endustriyel-eldiven-xl");
  });

  it("removes leading and trailing dashes", () => {
    expect(slugify("--Hello World--")).toBe("hello-world");
  });
});

describe("isRecord", () => {
  it("accepts plain objects only", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
  });
});
