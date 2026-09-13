import { describe, expect, it } from "vitest";

import { parseSessionCookie, signSessionId } from "./session.service";

const secret = "0123456789abcdef0123456789abcdef";

describe("session cookie signing", () => {
  it("round-trips a signed id", () => {
    const id = "abc123DEF456";
    const cookie = `${id}.${signSessionId(id, secret)}`;
    expect(parseSessionCookie(cookie, secret)).toBe(id);
  });

  it("rejects a tampered id", () => {
    const cookie = `abc.${signSessionId("abd", secret)}`;
    expect(parseSessionCookie(cookie, secret)).toBeNull();
  });

  it("rejects a signature made with another secret", () => {
    const cookie = `abc.${signSessionId("abc", "another-secret-another-secret-xx")}`;
    expect(parseSessionCookie(cookie, secret)).toBeNull();
  });

  it("rejects malformed values", () => {
    expect(parseSessionCookie(undefined, secret)).toBeNull();
    expect(parseSessionCookie("", secret)).toBeNull();
    expect(parseSessionCookie("no-dot", secret)).toBeNull();
    expect(parseSessionCookie(".sigonly", secret)).toBeNull();
  });
});
