import { describe, expect, it } from "vitest";

import { checkMetafieldValue } from "./validation";

describe("checkMetafieldValue", () => {
  it("validates text with length, regex and choices", () => {
    expect(checkMetafieldValue("single_line_text", { maxLength: 3 }, "abcd")).toMatchObject({
      ok: false,
    });
    expect(checkMetafieldValue("single_line_text", {}, "a\nb")).toMatchObject({ ok: false });
    expect(checkMetafieldValue("single_line_text", { regex: "^[A-Z]{2}$" }, "TR")).toEqual({
      ok: true,
      value: "TR",
    });
    expect(
      checkMetafieldValue("single_line_text", { choices: ["steel", "nylon"] }, "wool"),
    ).toMatchObject({ ok: false });
  });

  it("coerces and bounds numbers and booleans", () => {
    expect(checkMetafieldValue("integer", { min: 1 }, "5")).toEqual({ ok: true, value: 5 });
    expect(checkMetafieldValue("integer", {}, 1.5)).toMatchObject({ ok: false });
    expect(checkMetafieldValue("decimal", { max: 10 }, 12.5)).toMatchObject({ ok: false });
    expect(checkMetafieldValue("boolean", {}, "true")).toEqual({ ok: true, value: true });
  });

  it("checks dates, urls, json and references", () => {
    expect(checkMetafieldValue("date", {}, "2026-02-30")).toMatchObject({ ok: false });
    expect(checkMetafieldValue("date", {}, "2026-09-13")).toEqual({
      ok: true,
      value: "2026-09-13",
    });
    expect(checkMetafieldValue("url", {}, "javascript:alert(1)")).toMatchObject({ ok: false });
    expect(checkMetafieldValue("url", {}, "https://ocean.dev")).toEqual({
      ok: true,
      value: "https://ocean.dev",
    });
    expect(checkMetafieldValue("json", {}, '{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(checkMetafieldValue("product_reference", {}, "nope")).toMatchObject({ ok: false });
  });
});
