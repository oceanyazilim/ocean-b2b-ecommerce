import type {
  ApiFieldError,
  BusinessAddressAnswers,
  BusinessProfileAnswers,
  CountryProfileDetail,
} from "@ocean/types";

import { ValidationError } from "../../common/errors/domain-error";

export interface BusinessProfileSubmission {
  businessEntityType: string;
  businessProfile: BusinessProfileAnswers;
  businessAddress: BusinessAddressAnswers;
}

// Validates a merchant's submitted business-profile + address answers against the REAL schema of
// whichever CountryProfile they selected. This is the server-side half of spec sections 17-19's
// dynamic form engine: the frontend renders whatever this country's businessProfileSchema /
// addressSchema say, but a client can send anything, so every rule the schema encodes (required,
// validationRegex, entity-type visibility, select options) is re-checked here. No country ever
// gets a branch of its own — everything comes from the CountryProfileDetail passed in, which is
// what makes this the same function for Turkey, Germany, or the 50th country added after this
// code ships.
//
// Output only ever contains keys that are (a) defined in the country's schema and (b) visible for
// the chosen entity type — hidden/unknown answers are silently dropped rather than stored, so a
// client can't smuggle in stale data for a field that no longer applies once the entity type (or
// country) changes.
export function validateBusinessProfileSubmission(
  country: CountryProfileDetail,
  input: {
    businessEntityType: string;
    businessProfile: BusinessProfileAnswers;
    businessAddress: BusinessAddressAnswers;
  },
): BusinessProfileSubmission {
  const entityType = country.businessEntityTypes.find((e) => e.code === input.businessEntityType);
  if (!entityType) {
    throw new ValidationError(`Not a valid business type for ${country.name}.`, [
      { path: "businessEntityType", message: `Not a valid business type for ${country.name}` },
    ]);
  }

  const fields: ApiFieldError[] = [];
  const businessProfile: BusinessProfileAnswers = {};

  for (const field of country.businessProfileSchema) {
    if (!isVisible(field.visibilityRules, entityType.code)) continue;

    const value = normalizeAnswer(input.businessProfile[field.key]);
    const isEmpty = value === null || value === "";

    if (field.required && isEmpty) {
      fields.push({ path: `businessProfile.${field.key}`, message: `${field.label} is required` });
      continue;
    }
    if (isEmpty) continue;

    if (field.validationRegex) {
      const regex = safeRegex(field.validationRegex);
      if (regex && !regex.test(String(value))) {
        fields.push({
          path: `businessProfile.${field.key}`,
          message: `${field.label} is not in the correct format`,
        });
        continue;
      }
    }

    if (field.inputType === "select" && field.options && field.options.length > 0) {
      if (!field.options.some((o) => o.value === String(value))) {
        fields.push({
          path: `businessProfile.${field.key}`,
          message: `${field.label} is not a valid option`,
        });
        continue;
      }
    }

    businessProfile[field.key] = field.inputType === "checkbox" ? Boolean(value) : value;
  }

  const businessAddress: BusinessAddressAnswers = {};
  for (const field of country.addressSchema) {
    const raw = input.businessAddress[field.key];
    const value = typeof raw === "string" ? raw.trim() : "";

    if (field.required && !value) {
      fields.push({ path: `businessAddress.${field.key}`, message: `${field.label} is required` });
      continue;
    }
    if (!value) continue;

    if (field.type === "select" && field.options && field.options.length > 0) {
      if (!field.options.some((o) => o.value === value)) {
        fields.push({
          path: `businessAddress.${field.key}`,
          message: `${field.label} is not a valid option`,
        });
        continue;
      }
    }
    if (field.maxLength && value.length > field.maxLength) {
      fields.push({
        path: `businessAddress.${field.key}`,
        message: `${field.label} must be ${field.maxLength} characters or fewer`,
      });
      continue;
    }

    businessAddress[field.key] = value;
  }

  if (fields.length > 0) {
    throw new ValidationError("Fix the highlighted fields and try again.", fields);
  }

  return { businessEntityType: entityType.code, businessProfile, businessAddress };
}

function isVisible(
  rule: { entityTypeIn?: string[] } | undefined,
  entityTypeCode: string,
): boolean {
  if (!rule?.entityTypeIn || rule.entityTypeIn.length === 0) return true;
  return rule.entityTypeIn.includes(entityTypeCode);
}

function normalizeAnswer(raw: unknown): string | number | boolean | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "number" || typeof raw === "boolean") return raw;
  return null;
}

function safeRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}
