import { describe, expect, it } from "vitest";

import { availableOf, removableFrom, stockStatus } from "./stock";

describe("stock arithmetic", () => {
  it("subtracts reserved and damaged units from what is on hand", () => {
    expect(availableOf({ quantity: 10, reserved: 3, damaged: 2 })).toBe(5);
    expect(availableOf({ quantity: 0, reserved: 0, damaged: 0 })).toBe(0);
  });

  it("classifies stock status around the low threshold", () => {
    expect(stockStatus(0)).toBe("out_of_stock");
    expect(stockStatus(-1)).toBe("out_of_stock");
    expect(stockStatus(1)).toBe("low");
    expect(stockStatus(5)).toBe("low");
    expect(stockStatus(6)).toBe("in_stock");
  });

  it("never lets a location give up more than its sellable units", () => {
    expect(removableFrom({ quantity: 4, reserved: 4, damaged: 0 })).toBe(0);
    expect(removableFrom({ quantity: 4, reserved: 1, damaged: 1 })).toBe(2);
  });
});
