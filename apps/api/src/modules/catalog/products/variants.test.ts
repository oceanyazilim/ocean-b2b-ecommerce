import type { VariantInput } from "@ocean/types";
import { describe, expect, it } from "vitest";

import { cartesian, planVariants, variantTitle } from "./variants";

const v = (optionValues: string[], extra: Partial<VariantInput> = {}): VariantInput => ({
  optionValues,
  price: 1000,
  weightUnit: "kg",
  taxable: true,
  requiresShipping: true,
  ...extra,
});

describe("cartesian", () => {
  it("expands option combinations in order", () => {
    expect(
      cartesian([
        { name: "Color", values: ["Black", "Red"] },
        { name: "Size", values: ["M", "L", "XL"] },
      ]),
    ).toEqual([
      ["Black", "M"],
      ["Black", "L"],
      ["Black", "XL"],
      ["Red", "M"],
      ["Red", "L"],
      ["Red", "XL"],
    ]);
    expect(cartesian([])).toEqual([[]]);
    expect(variantTitle([])).toBe("Default Title");
    expect(variantTitle(["Red", "L"])).toBe("Red / L");
  });
});

describe("planVariants", () => {
  const options = [
    { name: "Color", values: ["Black", "Red"] },
    { name: "Size", values: ["M", "L"] },
  ];

  it("keeps ids for unchanged combinations, creates new ones, removes vanished ones", () => {
    const existing = [
      { id: "a", optionValues: ["Black", "M"] },
      { id: "b", optionValues: ["Black", "L"] },
      { id: "c", optionValues: ["Green", "M"] },
    ];
    const plan = planVariants(options, [v(["Black", "M"]), v(["Red", "L"])], existing);
    expect(plan.update.map((u) => u.id)).toEqual(["a"]);
    expect(plan.create.map((c) => c.optionValues)).toEqual([["Red", "L"]]);
    expect(plan.removeIds.sort()).toEqual(["b", "c"]);
  });

  it("rejects combinations outside the options, duplicates and arity mismatches", () => {
    expect(() => planVariants(options, [v(["Blue", "M"])], [])).toThrow(/does not match/);
    expect(() => planVariants(options, [v(["Black", "M"]), v(["Black", "M"])], [])).toThrow(
      /Duplicate/,
    );
    expect(() => planVariants(options, [v(["Black"])], [])).toThrow(/2 option value/);
    expect(() => planVariants([{ name: "Size", values: ["M", "m"] }], [v(["M"])], [])).toThrow(
      /duplicate values/,
    );
  });

  it("supports the single default variant without options", () => {
    const plan = planVariants([], [v([])], [{ id: "d", optionValues: [] }]);
    expect(plan.update).toEqual([{ id: "d", input: v([]) }]);
    expect(plan.create).toEqual([]);
  });
});
