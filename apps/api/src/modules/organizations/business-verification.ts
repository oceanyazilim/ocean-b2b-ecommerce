import type {
  BusinessAddressAnswers,
  BusinessProfileAnswers,
  BusinessVerificationCategory,
  BusinessVerificationCategoryKey,
  CountryProfileDetail,
  OrganizationBusinessVerification,
} from "@ocean/types";

// Business verification (L5, spec section 30): a completeness view over real data the platform
// already collects — never a real identity/KYC or banking integration. The categories below are
// exactly the six spec section 30 lists. Four have real backing today (business information,
// authorized representative, tax information, address verification); the other two (identity
// verification, banking information) have no data source anywhere in this codebase yet, so they
// are always reported "not_collected" — honest about the boundary rather than faking a pass or a
// fail for something nobody has entered. No country ever gets a branch of its own: every check
// below reads whichever CountryProfile the merchant selected, the same principle as
// business-profile-validation.ts.

const AUTHORIZED_REP_KEY = "authorizedRepresentativeName";

export interface BusinessVerificationOrgInput {
  businessCountryCode: string | null;
  businessEntityType: string | null;
  businessProfile: BusinessProfileAnswers;
  businessAddress: BusinessAddressAnswers;
}

export interface BusinessVerificationTaxRegistration {
  countryCode: string;
  status: string;
}

function isVisible(rule: { entityTypeIn?: string[] } | undefined, entityTypeCode: string): boolean {
  if (!rule?.entityTypeIn || rule.entityTypeIn.length === 0) return true;
  return rule.entityTypeIn.includes(entityTypeCode);
}

function isBlankAnswer(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function businessInformationCategory(
  org: BusinessVerificationOrgInput,
  country: CountryProfileDetail | null,
): BusinessVerificationCategory {
  const key: BusinessVerificationCategoryKey = "business_information";
  const label = "Business information";
  if (!org.businessCountryCode || !org.businessEntityType || !country) {
    return {
      key,
      label,
      status: "action_required",
      message: "Select your business country and how your business operates.",
      settingsPage: "business",
    };
  }

  const missing = country.businessProfileSchema.filter(
    (field) =>
      field.key !== AUTHORIZED_REP_KEY &&
      field.required &&
      isVisible(field.visibilityRules, org.businessEntityType as string) &&
      isBlankAnswer(org.businessProfile[field.key]),
  );

  if (missing.length > 0) {
    return {
      key,
      label,
      status: "action_required",
      message: `${missing.length} required field${missing.length === 1 ? "" : "s"} missing: ${missing
        .map((f) => f.label)
        .join(", ")}.`,
      settingsPage: "business",
    };
  }

  return {
    key,
    label,
    status: "complete",
    message: "All required business details are on file.",
    settingsPage: "business",
  };
}

function authorizedRepresentativeCategory(
  org: BusinessVerificationOrgInput,
  country: CountryProfileDetail | null,
): BusinessVerificationCategory {
  const key: BusinessVerificationCategoryKey = "authorized_representative";
  const label = "Authorized representative";
  if (!org.businessCountryCode || !org.businessEntityType || !country) {
    return {
      key,
      label,
      status: "action_required",
      message: "Select your business country and how your business operates.",
      settingsPage: "business",
    };
  }

  const field = country.businessProfileSchema.find(
    (f) => f.key === AUTHORIZED_REP_KEY && isVisible(f.visibilityRules, org.businessEntityType as string),
  );
  if (!field) {
    return {
      key,
      label,
      status: "not_collected",
      message: `${country.name} doesn't define an authorized-representative field.`,
    };
  }

  if (isBlankAnswer(org.businessProfile[field.key])) {
    return {
      key,
      label,
      status: "action_required",
      message: `${field.label} is required.`,
      settingsPage: "business",
    };
  }

  return { key, label, status: "complete", message: "Authorized representative is on file.", settingsPage: "business" };
}

function taxInformationCategory(
  org: BusinessVerificationOrgInput,
  country: CountryProfileDetail | null,
  taxRegistrations: BusinessVerificationTaxRegistration[],
): BusinessVerificationCategory {
  const key: BusinessVerificationCategoryKey = "tax_information";
  const label = "Tax information";
  if (!org.businessCountryCode || !country) {
    return {
      key,
      label,
      status: "action_required",
      message: "Select your business country first.",
      settingsPage: "business",
    };
  }

  if (country.taxSystemType === "none") {
    return {
      key,
      label,
      status: "complete",
      message: `${country.name} has no tax registration requirement.`,
    };
  }

  const hasActive = taxRegistrations.some(
    (r) => r.countryCode === org.businessCountryCode && r.status === "active",
  );
  if (!hasActive) {
    return {
      key,
      label,
      status: "action_required",
      message: `Add an active ${country.taxTerminology.englishName} registration for ${country.name}.`,
      settingsPage: "taxes",
    };
  }

  return { key, label, status: "complete", message: "An active tax registration is on file.", settingsPage: "taxes" };
}

function addressVerificationCategory(
  org: BusinessVerificationOrgInput,
  country: CountryProfileDetail | null,
): BusinessVerificationCategory {
  const key: BusinessVerificationCategoryKey = "address_verification";
  const label = "Address verification";
  if (!org.businessCountryCode || !country) {
    return {
      key,
      label,
      status: "action_required",
      message: "Select your business country first.",
      settingsPage: "business",
    };
  }

  const missing = country.addressSchema.filter(
    (field) => field.required && isBlankAnswer(org.businessAddress[field.key]),
  );
  if (missing.length > 0) {
    return {
      key,
      label,
      status: "action_required",
      message: `${missing.length} required address field${missing.length === 1 ? "" : "s"} missing: ${missing
        .map((f) => f.label)
        .join(", ")}.`,
      settingsPage: "business",
    };
  }

  return { key, label, status: "complete", message: "Business address is on file.", settingsPage: "business" };
}

// No document-upload or external verification API exists in this codebase — this is a deliberate
// boundary (see spec section 30's "possible verification data" vs. what a real KYC integration
// would require), not an oversight. Always "not_collected" until that future integration exists.
function identityVerificationCategory(): BusinessVerificationCategory {
  return {
    key: "identity_verification",
    label: "Identity verification",
    status: "not_collected",
    message:
      "Document-based identity verification isn't collected by this platform yet — a future KYC integration point.",
  };
}

function bankingInformationCategory(): BusinessVerificationCategory {
  return {
    key: "banking_information",
    label: "Banking information",
    status: "not_collected",
    message: "Banking details aren't collected by this platform yet — a future payouts integration point.",
  };
}

export function computeBusinessVerification(
  org: BusinessVerificationOrgInput,
  country: CountryProfileDetail | null,
  taxRegistrations: BusinessVerificationTaxRegistration[],
): OrganizationBusinessVerification {
  const categories: BusinessVerificationCategory[] = [
    businessInformationCategory(org, country),
    authorizedRepresentativeCategory(org, country),
    identityVerificationCategory(),
    taxInformationCategory(org, country, taxRegistrations),
    addressVerificationCategory(org, country),
    bankingInformationCategory(),
  ];

  // Only categories this platform actually has a real data source for count toward the overall
  // status; "not_collected" categories (identity, banking — and an authorized-representative
  // field a country's schema doesn't define) never block "verified".
  const blocking = categories.filter((c) => c.status === "action_required");
  const status = !org.businessCountryCode ? "unverified" : blocking.length > 0 ? "action_required" : "verified";

  return { status, checkedAt: new Date().toISOString(), categories };
}
