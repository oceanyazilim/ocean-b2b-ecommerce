import { describe, expect, it } from "vitest";

import { uniqueSlug } from "./slug";

describe("uniqueSlug", () => {
  it("returns the base slug when free", async () => {
    expect(await uniqueSlug("ACME Wholesale", async () => false)).toBe("acme-wholesale");
  });

  it("appends a numeric suffix when taken", async () => {
    const taken = new Set(["acme", "acme-2"]);
    expect(await uniqueSlug("ACME", async (c) => taken.has(c))).toBe("acme-3");
  });

  it("falls back when the name has no slug characters", async () => {
    expect(await uniqueSlug("!!!", async () => false, "org")).toBe("org");
  });
});
