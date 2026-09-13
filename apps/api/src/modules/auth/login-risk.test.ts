import { describe, expect, it } from "vitest";

import { deriveRiskFlags, userAgentFamily } from "./login-risk";

const CHROME_WIN =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1";

describe("userAgentFamily", () => {
  it("classifies common agents", () => {
    expect(userAgentFamily(CHROME_WIN)).toBe("Chrome/Windows");
    expect(userAgentFamily(SAFARI_IOS)).toBe("Safari/iOS");
    expect(userAgentFamily("curl/8.4.0")).toBe("curl/unknown");
    expect(userAgentFamily(null)).toBe("unknown");
  });
});

describe("deriveRiskFlags", () => {
  const history = [{ ip: "1.1.1.1", userAgent: CHROME_WIN }];

  it("has no flags without history", () => {
    expect(deriveRiskFlags([], { ip: "9.9.9.9", userAgent: SAFARI_IOS })).toEqual([]);
  });

  it("flags a new ip and a new device independently", () => {
    expect(deriveRiskFlags(history, { ip: "1.1.1.1", userAgent: CHROME_WIN })).toEqual([]);
    expect(deriveRiskFlags(history, { ip: "2.2.2.2", userAgent: CHROME_WIN })).toEqual(["new_ip"]);
    expect(deriveRiskFlags(history, { ip: "1.1.1.1", userAgent: SAFARI_IOS })).toEqual([
      "new_device",
    ]);
    expect(deriveRiskFlags(history, { ip: "2.2.2.2", userAgent: SAFARI_IOS })).toEqual([
      "new_ip",
      "new_device",
    ]);
  });
});
