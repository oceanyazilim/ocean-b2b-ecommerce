import { describe, expect, it } from "vitest";

import { sanitizeRichText } from "./sanitize";

describe("sanitizeRichText", () => {
  it("keeps formatting and strips scripts, handlers and styles", () => {
    const out = sanitizeRichText(
      '<p style="color:red" onclick="x()">Hi <strong>there</strong></p><script>alert(1)</script><img src="javascript:alert(1)">',
    );
    expect(out).toBe("<p>Hi <strong>there</strong></p><img />");
  });

  it("forces safe rel on links and allows only http(s)/mailto", () => {
    expect(sanitizeRichText('<a href="https://x.y" target="_blank">x</a>')).toBe(
      '<a href="https://x.y" target="_blank" rel="noopener noreferrer">x</a>',
    );
    expect(sanitizeRichText('<a href="javascript:alert(1)">x</a>')).toBe(
      '<a rel="noopener noreferrer">x</a>',
    );
  });
});
