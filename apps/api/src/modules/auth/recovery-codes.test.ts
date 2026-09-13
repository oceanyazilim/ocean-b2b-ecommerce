import { describe, expect, it } from "vitest";

import {
  consumeRecoveryCode,
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
} from "./recovery-codes";

describe("recovery codes", () => {
  it("generates ten unique, unambiguous codes", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[23456789A-HJKMNP-Z]{5}-[23456789A-HJKMNP-Z]{5}$/);
  });

  it("consumes a code exactly once, ignoring case and separators", () => {
    const codes = generateRecoveryCodes();
    const hashes = codes.map(hashRecoveryCode);
    const first = codes[0] as string;
    const remaining = consumeRecoveryCode(hashes, first.toLowerCase().replace("-", " "));
    expect(remaining).toHaveLength(9);
    expect(consumeRecoveryCode(remaining as string[], first)).toBeNull();
    expect(consumeRecoveryCode(hashes, "ZZZZZ-ZZZZZ")).toBeNull();
  });

  it("normalizes input", () => {
    expect(normalizeRecoveryCode(" ab-cd ef ")).toBe("ABCDEF");
  });
});
