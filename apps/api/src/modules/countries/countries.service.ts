import { Injectable } from "@nestjs/common";
import type { CountryProfile } from "@ocean/db";
import type {
  AddressFieldDefinition,
  BusinessEntityType,
  BusinessProfileFieldDefinition,
  CountryProfileDetail,
  CountryProfileSummary,
  PostalCodeRules,
  TaxIdFormat,
  TaxTerminology,
} from "@ocean/types";

import { NotFoundError } from "../../common/errors/domain-error";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

function toSummary(row: CountryProfile): CountryProfileSummary {
  return {
    id: row.id,
    countryCode: row.countryCode,
    name: row.name,
    isActive: row.isActive,
    version: row.version,
    supportedCurrencies: row.supportedCurrencies,
    supportedLanguages: row.supportedLanguages,
    taxSystemType: row.taxSystemType,
    taxTerminology: row.taxTerminology as unknown as TaxTerminology,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDetail(row: CountryProfile): CountryProfileDetail {
  return {
    ...toSummary(row),
    addressSchema: row.addressSchema as unknown as AddressFieldDefinition[],
    postalCodeRules: row.postalCodeRules as unknown as PostalCodeRules | null,
    stateProvinceRequired: row.stateProvinceRequired,
    stateProvinceLabel: row.stateProvinceLabel,
    taxIdFormats: row.taxIdFormats as unknown as TaxIdFormat[],
    supportedPaymentMethods: row.supportedPaymentMethods,
    businessEntityTypes: row.businessEntityTypes as unknown as BusinessEntityType[],
    businessProfileSchema: row.businessProfileSchema as unknown as BusinessProfileFieldDefinition[],
  };
}

// The Global Country Engine (L1 foundation of the localization initiative): a single
// platform-owned catalog table (one row per ISO country, no tenant column — same pattern as
// Theme/Plan), read here and nowhere else. Every future localization concern — the merchant
// onboarding form engine, address validation, tax terminology display, business-entity-specific
// requirements — reads through this service (or `getCountryProfile` directly, for other backend
// services) instead of re-deriving country rules of its own. No country-specific branches live
// here or anywhere downstream: everything varies through the CountryProfile's JSON columns.
@Injectable()
export class CountryProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async listActive(): Promise<CountryProfileSummary[]> {
    const rows = await this.prisma.countryProfile.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    return rows.map(toSummary);
  }

  // The reusable, non-HTTP entry point: other backend services (address validation, tax
  // terminology lookups, a future onboarding-form service) call this directly rather than
  // hitting the HTTP layer or re-querying CountryProfile themselves. Returns null rather than
  // throwing, since "no profile for this code" is a normal, expected outcome for a caller that
  // wants to fall back to a generic default.
  async getCountryProfile(countryCode: string): Promise<CountryProfileDetail | null> {
    const code = countryCode.trim().toUpperCase();
    const row = await this.prisma.countryProfile.findUnique({ where: { countryCode: code } });
    return row ? toDetail(row) : null;
  }

  // Batched form of getCountryProfile for callers that need N countries' worth of data at once
  // (tax registrations grouped by country, market/analytics country breakdowns, ...) — a single
  // `WHERE country_code IN (...)` instead of one round trip per country, which is the difference
  // between a page load that's DB-latency-bound by 1 query and one that's bound by N. Keyed
  // lookup is left to the caller (build a Map from `.countryCode`) since callers want different
  // key shapes (some also need a `null`/unmatched fallback).
  async getCountryProfiles(countryCodes: string[]): Promise<CountryProfileDetail[]> {
    const codes = [...new Set(countryCodes.map((c) => c.trim().toUpperCase()).filter(Boolean))];
    if (codes.length === 0) return [];
    const rows = await this.prisma.countryProfile.findMany({ where: { countryCode: { in: codes } } });
    return rows.map(toDetail);
  }

  // HTTP-facing wrapper: same lookup, but 404s instead of returning null, for the merchant-facing
  // read endpoint (onboarding forms need to know a code is invalid, not silently render nothing).
  async getByCode(countryCode: string): Promise<CountryProfileDetail> {
    const profile = await this.getCountryProfile(countryCode);
    if (!profile) throw new NotFoundError("Country profile");
    return profile;
  }
}
