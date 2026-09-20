import { Injectable } from "@nestjs/common";
import type { CountryProfile } from "@ocean/db";
import type {
  AddressFieldDefinition,
  BusinessProfileFieldDefinition,
  PlatformCountrySummary,
  TaxIdFormat,
} from "@ocean/types";

import { PrismaService } from "../../infrastructure/prisma/prisma.service";

// Platform Admin -> Countries (spec section 32): a read-only, cross-tenant view over the L1
// CountryProfile catalog, with per-country "Configured"/"Not configured" flags computed for real
// from that row's own JSON columns and from real InvoiceSettings rows — never hardcoded, and
// never a second source of truth for country data (see CountryProfilesService, the only writer).
@Injectable()
export class PlatformCountriesService {
  constructor(private readonly prisma: PrismaService) {}

  private toSummary(row: CountryProfile, invoiceConfiguredStoreCount: number): PlatformCountrySummary {
    const addressSchema = row.addressSchema as unknown as AddressFieldDefinition[];
    const taxIdFormats = row.taxIdFormats as unknown as TaxIdFormat[];
    const businessProfileSchema = row.businessProfileSchema as unknown as BusinessProfileFieldDefinition[];
    return {
      countryCode: row.countryCode,
      name: row.name,
      isActive: row.isActive,
      version: row.version,
      storefrontLocales: row.supportedLanguages,
      defaultCurrency: row.supportedCurrencies[0] ?? null,
      taxEngineConfigured: taxIdFormats.length > 0,
      businessSchemaCount: businessProfileSchema.length,
      addressSchemaConfigured: addressSchema.length > 0,
      invoiceConfiguredStoreCount,
      invoiceConfigurationConfigured: invoiceConfiguredStoreCount > 0,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async list(): Promise<PlatformCountrySummary[]> {
    const [countries, invoiceSettingsRows] = await Promise.all([
      this.prisma.countryProfile.findMany({ orderBy: { name: "asc" } }),
      // A real, merchant-saved InvoiceSettings row (spec section 28), joined to the store's
      // organization's real L2 business country — not every store in a country, just the ones
      // that have actually configured invoicing.
      this.prisma.invoiceSettings.findMany({
        select: { store: { select: { organization: { select: { businessCountryCode: true } } } } },
      }),
    ]);

    const countByCountry = new Map<string, number>();
    for (const row of invoiceSettingsRows) {
      const code = row.store.organization.businessCountryCode;
      if (!code) continue;
      countByCountry.set(code, (countByCountry.get(code) ?? 0) + 1);
    }

    return countries.map((c) => this.toSummary(c, countByCountry.get(c.countryCode) ?? 0));
  }
}
