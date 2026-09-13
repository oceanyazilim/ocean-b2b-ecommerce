import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { decryptWithKey, encryptWithKey } from "./encryption.service";

describe("encryption", () => {
  const key = randomBytes(32);

  it("round-trips and never repeats ciphertext", () => {
    const a = encryptWithKey(key, "JBSWY3DPEHPK3PXP");
    const b = encryptWithKey(key, "JBSWY3DPEHPK3PXP");
    expect(a).not.toBe(b);
    expect(decryptWithKey(key, a)).toBe("JBSWY3DPEHPK3PXP");
    expect(decryptWithKey(key, b)).toBe("JBSWY3DPEHPK3PXP");
  });

  it("rejects tampering and wrong keys", () => {
    const payload = encryptWithKey(key, "secret");
    const parts = payload.split(":");
    parts[3] = Buffer.from("x".repeat(6)).toString("base64url");
    expect(() => decryptWithKey(key, parts.join(":"))).toThrow();
    expect(() => decryptWithKey(randomBytes(32), payload)).toThrow();
    expect(() => decryptWithKey(key, "v0:a:b:c")).toThrow(/format/);
  });
});
