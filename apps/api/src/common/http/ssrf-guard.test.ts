import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { assertPublicHttpUrl } from "./ssrf-guard";

describe("assertPublicHttpUrl", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    // The guard is a no-op outside production (real dev/test webhooks target 127.0.0.1) —
    // force production here so the actual blocking logic gets exercised.
    process.env.NODE_ENV = "production";
  });
  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("rejects non-http(s) schemes and malformed URLs", async () => {
    await expect(assertPublicHttpUrl("not a url")).rejects.toThrow();
    await expect(assertPublicHttpUrl("ftp://example.com/x")).rejects.toThrow();
    await expect(assertPublicHttpUrl("file:///etc/passwd")).rejects.toThrow();
  });

  it("rejects localhost and loopback/private/link-local IP literals", async () => {
    await expect(assertPublicHttpUrl("http://localhost/hook")).rejects.toThrow();
    await expect(assertPublicHttpUrl("http://127.0.0.1/hook")).rejects.toThrow();
    await expect(assertPublicHttpUrl("http://127.0.0.1:4000/admin/v1/x")).rejects.toThrow();
    await expect(assertPublicHttpUrl("http://10.0.0.5/hook")).rejects.toThrow();
    await expect(assertPublicHttpUrl("http://172.16.0.1/hook")).rejects.toThrow();
    await expect(assertPublicHttpUrl("http://192.168.1.1/hook")).rejects.toThrow();
    // The classic cloud-metadata SSRF target.
    await expect(assertPublicHttpUrl("http://169.254.169.254/latest/meta-data/")).rejects.toThrow();
    await expect(assertPublicHttpUrl("http://[::1]/hook")).rejects.toThrow();
  });

  it("allows a real public IP literal", async () => {
    // 8.8.8.8 (Google DNS) — a real, stable, non-private public address, not a live endpoint
    // this call actually reaches (assertPublicHttpUrl never makes an HTTP request itself).
    await expect(assertPublicHttpUrl("https://8.8.8.8/hook")).resolves.toBeUndefined();
  });
});
