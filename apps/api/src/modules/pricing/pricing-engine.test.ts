import { describe, expect, it } from "vitest";

import { applyBps, checkQuantityRule, resolvePrice, selectTier } from "./pricing-engine";

describe("pricing engine", () => {
  it("applies basis points with half-up rounding and a floor of zero", () => {
    expect(applyBps(10_000, -1000)).toBe(9_000);
    expect(applyBps(999, -1500)).toBe(849);
    expect(applyBps(10_000, 250)).toBe(10_250);
    expect(applyBps(100, -10_000)).toBe(0);
    expect(applyBps(123, 0)).toBe(123);
  });

  it("picks the last tier the quantity reaches", () => {
    const tiers = [
      { minQuantity: 10, value: 9_200 },
      { minQuantity: 50, value: 8_500 },
      { minQuantity: 100, value: 7_800 },
    ];
    expect(selectTier(tiers, 1)).toBeNull();
    expect(selectTier(tiers, 10)?.value).toBe(9_200);
    expect(selectTier(tiers, 99)?.value).toBe(8_500);
    expect(selectTier(tiers, 1_000)?.value).toBe(7_800);
  });

  it("follows the precedence contract → price list → volume → base", () => {
    const base = { basePrice: 10_000, quantity: 60, priceList: null, volumeRule: null };
    expect(resolvePrice({ ...base, contract: null })).toMatchObject({
      unitPrice: 10_000,
      source: "base",
    });

    const list = { id: "pl", explicitPrice: null, adjustmentBps: -2000 };
    expect(resolvePrice({ ...base, contract: null, priceList: list })).toMatchObject({
      unitPrice: 8_000,
      source: "price_list",
      priceListId: "pl",
    });
    expect(
      resolvePrice({ ...base, contract: null, priceList: { ...list, explicitPrice: 7_500 } }),
    ).toMatchObject({ unitPrice: 7_500, source: "price_list" });

    const rule = {
      id: "vr",
      tierType: "percent_off" as const,
      tiers: [
        { minQuantity: 10, value: 500 },
        { minQuantity: 50, value: 1000 },
      ],
    };
    const volume = resolvePrice({ ...base, contract: null, priceList: list, volumeRule: rule });
    expect(volume).toMatchObject({
      unitPrice: 7_200,
      source: "volume",
      volumeRuleId: "vr",
      appliedTier: { minQuantity: 50, value: 1000 },
    });
    expect(volume.tiers).toEqual([
      { minQuantity: 10, unitPrice: 7_600 },
      { minQuantity: 50, unitPrice: 7_200 },
    ]);
    expect(
      resolvePrice({ ...base, quantity: 5, contract: null, priceList: list, volumeRule: rule }),
    ).toMatchObject({ unitPrice: 8_000, source: "price_list", appliedTier: null });

    const fixed = {
      id: "vf",
      tierType: "fixed_price" as const,
      tiers: [{ minQuantity: 12, value: 6_000 }],
    };
    expect(resolvePrice({ ...base, contract: null, volumeRule: fixed })).toMatchObject({
      unitPrice: 6_000,
      source: "volume",
    });

    expect(
      resolvePrice({
        ...base,
        contract: { id: "cp", price: 5_000 },
        priceList: list,
        volumeRule: rule,
      }),
    ).toMatchObject({ unitPrice: 5_000, source: "contract", contractPriceId: "cp", tiers: [] });
  });

  it("validates quantity rules and suggests the nearest valid quantity", () => {
    const rule = { minQuantity: 12, maxQuantity: 120, increment: 6 };
    expect(checkQuantityRule(null, 1).ok).toBe(true);
    expect(checkQuantityRule(rule, 18).ok).toBe(true);
    expect(checkQuantityRule(rule, 13)).toMatchObject({
      ok: false,
      suggestedQuantity: 18,
      message: "Order in multiples of 6.",
    });
    expect(checkQuantityRule(rule, 5)).toMatchObject({ ok: false, suggestedQuantity: 12 });
    expect(checkQuantityRule(rule, 500)).toMatchObject({ ok: false, suggestedQuantity: 120 });
    expect(
      checkQuantityRule({ minQuantity: null, maxQuantity: 10, increment: 4 }, 11),
    ).toMatchObject({ ok: false, suggestedQuantity: 8 });
    expect(
      checkQuantityRule({ minQuantity: 3, maxQuantity: null, increment: null }, 1).message,
    ).toBe("Minimum order quantity is 3.");
  });
});
