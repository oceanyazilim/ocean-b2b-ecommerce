export function assertNever(value: never, message = "Unexpected value"): never {
  throw new Error(`${message}: ${JSON.stringify(value)}`);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Used for product handles, store slugs, collection handles, etc.
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// L4 Global Localization (spec section 3, RTL support): the set of right-to-left ISO 639-1/639-2
// language subtags. This is a closed linguistic fact (there are only a handful of RTL scripts in
// active use), not a "limited number of languages" in the sense the spec forbids elsewhere — any
// LTR language a merchant adds (there is no limit on those) still works with zero extra code,
// since only locales whose subtag appears here ever get `dir="rtl"`.
const RTL_LANGUAGE_SUBTAGS = new Set([
  "ar", // Arabic
  "he", "iw", // Hebrew (iw is the legacy/deprecated tag some environments still emit)
  "fa", // Persian/Farsi
  "ur", // Urdu
  "ps", // Pashto
  "sd", // Sindhi
  "yi", // Yiddish
  "dv", // Divehi
  "ckb", // Central Kurdish (Sorani)
]);

// Extracts the primary language subtag from a BCP-47 locale ("ar-SA" -> "ar", "he" -> "he") and
// checks it against the RTL set above.
export function isRtlLocale(locale: string): boolean {
  const primary = locale.trim().toLowerCase().split("-")[0] ?? "";
  return RTL_LANGUAGE_SUBTAGS.has(primary);
}

export function localeDirection(locale: string): "ltr" | "rtl" {
  return isRtlLocale(locale) ? "rtl" : "ltr";
}
