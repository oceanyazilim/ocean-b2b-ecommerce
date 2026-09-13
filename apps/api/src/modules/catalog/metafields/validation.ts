import type { MetafieldType, MetafieldValidations } from "@ocean/types";

export type MetafieldCheck = { ok: true; value: unknown } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Normalizes and validates a metafield value against its definition. Reference types are
// checked for shape here and for same-store ownership in the service.
export function checkMetafieldValue(
  type: MetafieldType,
  validations: MetafieldValidations,
  raw: unknown,
): MetafieldCheck {
  switch (type) {
    case "single_line_text":
    case "multi_line_text": {
      if (typeof raw !== "string") return { ok: false, message: "Expected text" };
      if (type === "single_line_text" && /[\r\n]/.test(raw))
        return { ok: false, message: "Line breaks are not allowed" };
      if (validations.minLength !== undefined && raw.length < validations.minLength)
        return { ok: false, message: `At least ${validations.minLength} characters` };
      if (validations.maxLength !== undefined && raw.length > validations.maxLength)
        return { ok: false, message: `At most ${validations.maxLength} characters` };
      if (validations.regex && !safeRegex(validations.regex).test(raw))
        return { ok: false, message: "Does not match the required format" };
      if (validations.choices?.length && !validations.choices.includes(raw))
        return { ok: false, message: "Not one of the allowed choices" };
      return { ok: true, value: raw };
    }
    case "integer": {
      const n = typeof raw === "string" ? Number(raw) : raw;
      if (typeof n !== "number" || !Number.isInteger(n))
        return { ok: false, message: "Expected a whole number" };
      return range(n, validations);
    }
    case "decimal": {
      const n = typeof raw === "string" ? Number(raw) : raw;
      if (typeof n !== "number" || !Number.isFinite(n))
        return { ok: false, message: "Expected a number" };
      return range(n, validations);
    }
    case "boolean":
      if (typeof raw === "boolean") return { ok: true, value: raw };
      if (raw === "true" || raw === "false") return { ok: true, value: raw === "true" };
      return { ok: false, message: "Expected true or false" };
    case "date": {
      // Date.parse accepts "2026-02-30"; only a round-trip proves the calendar date exists.
      if (
        typeof raw !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(raw) ||
        new Date(`${raw}T00:00:00Z`).toISOString().slice(0, 10) !== raw
      ) {
        return { ok: false, message: "Expected a real date as YYYY-MM-DD" };
      }
      return { ok: true, value: raw };
    }
    case "url": {
      if (typeof raw !== "string") return { ok: false, message: "Expected a URL" };
      try {
        const u = new URL(raw);
        if (!["http:", "https:", "mailto:"].includes(u.protocol))
          return { ok: false, message: "Only http, https and mailto URLs" };
        return { ok: true, value: raw };
      } catch {
        return { ok: false, message: "Expected a valid URL" };
      }
    }
    case "json": {
      if (raw === undefined) return { ok: false, message: "Expected JSON" };
      try {
        const value = typeof raw === "string" ? JSON.parse(raw) : JSON.parse(JSON.stringify(raw));
        return { ok: true, value };
      } catch {
        return { ok: false, message: "Expected valid JSON" };
      }
    }
    case "product_reference":
    case "collection_reference":
    case "file_reference":
      if (typeof raw !== "string" || !UUID.test(raw))
        return { ok: false, message: "Expected a reference id" };
      return { ok: true, value: raw };
    default:
      return { ok: false, message: "Unsupported type" };
  }
}

function range(n: number, v: MetafieldValidations): MetafieldCheck {
  if (v.min !== undefined && n < v.min) return { ok: false, message: `Must be at least ${v.min}` };
  if (v.max !== undefined && n > v.max) return { ok: false, message: `Must be at most ${v.max}` };
  return { ok: true, value: n };
}

function safeRegex(source: string): RegExp {
  try {
    return new RegExp(source);
  } catch {
    return /(?:)/;
  }
}
