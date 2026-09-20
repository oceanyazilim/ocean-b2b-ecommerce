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

  // HTTP-facing wrapper: same lookup, but 404s instead of returning null, for the merchant-facing
  // read endpoint (onboarding forms need to know a code is invalid, not silently render nothing).
  async getByCode(countryCode: string): Promise<CountryProfileDetail> {
    const profile = await this.getCountryProfile(countryCode);
    if (!profile) throw new NotFoundError("Country profile");
    return profile;
  }
}
