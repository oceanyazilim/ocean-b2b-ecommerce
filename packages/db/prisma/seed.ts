import { hash } from "@node-rs/argon2";

import { PrismaClient } from "../generated/client";

const prisma = new PrismaClient();

const DEMO_EMAIL = "owner@demo.local";
const DEMO_PASSWORD = "DemoPass123!";

// A platform operator is provisioned here, not through self-serve signup (there is none —
// PlatformOperator rows are seeded/console-provisioned by design, see the model's comment in
// schema.prisma). This is the account apps/platform-admin logs in with.
const PLATFORM_OPERATOR_EMAIL = "operator@ocean.internal";
const PLATFORM_OPERATOR_PASSWORD = "PlatformOps123!";

// Minimal but real manifest: enough templates/sections/blocks for the theme editor (Phase 10)
// and a storefront renderer to have something to work with, without pretending to be a full
// theme.
const FOUNDATION_MANIFEST = {
  templates: [
    { type: "home", label: "Home page", sections: [] },
    { type: "product", label: "Product page", sections: [] },
    { type: "collection", label: "Collection page", sections: [] },
    { type: "cart", label: "Cart page", sections: [] },
    { type: "page", label: "Generic page", sections: [] },
  ],
  sections: [
    {
      type: "hero",
      label: "Hero banner",
      blocks: ["heading", "text", "button"],
      settings: [
        { key: "heading", label: "Heading", type: "text", default: "Welcome" },
        { key: "backgroundImage", label: "Background image", type: "image" },
      ],
    },
    {
      type: "featured-products",
      label: "Featured products",
      blocks: [],
      settings: [
        { key: "title", label: "Title", type: "text", default: "Featured products" },
        { key: "collectionHandle", label: "Collection", type: "text" },
      ],
    },
    {
      type: "rich-text",
      label: "Rich text",
      blocks: ["heading", "text"],
      settings: [],
    },
    {
      type: "image-with-text",
      label: "Image with text",
      blocks: ["heading", "text", "button"],
      settings: [{ key: "image", label: "Image", type: "image" }],
    },
  ],
  blocks: [
    { type: "heading", label: "Heading", settings: [{ key: "text", label: "Text", type: "text" }] },
    { type: "text", label: "Text", settings: [{ key: "text", label: "Text", type: "richtext" }] },
    {
      type: "button",
      label: "Button",
      settings: [
        { key: "label", label: "Label", type: "text", default: "Shop now" },
        { key: "url", label: "Link", type: "url" },
      ],
    },
  ],
  globalSettings: [
    { key: "primaryColor", label: "Primary color", type: "color", default: "#1a1a1a" },
    { key: "secondaryColor", label: "Secondary color", type: "color", default: "#f5f5f5" },
    { key: "logoUrl", label: "Logo", type: "image" },
  ],
};

// Wholesale Pro: the B2B-focused second theme. It reuses exactly the section/block types
// Foundation does (the storefront renderer only knows how to draw those four section types and
// three block types — see apps/storefront/components/renderer) so no renderer changes are
// needed. What makes it a distinct theme is the content: every section/block default and the
// brand colors are written for a wholesale buyer — volume pricing, company accounts, requesting
// a quote — instead of Foundation's general-purpose copy.
const WHOLESALE_PRO_MANIFEST = {
  templates: [
    { type: "home", label: "Home page", sections: [] },
    { type: "product", label: "Product page", sections: [] },
    { type: "collection", label: "Collection page", sections: [] },
    { type: "cart", label: "Cart page", sections: [] },
    { type: "page", label: "Generic page", sections: [] },
  ],
  sections: [
    {
      type: "hero",
      label: "Wholesale hero banner",
      blocks: ["heading", "text", "button"],
      settings: [
        {
          key: "heading",
          label: "Heading",
          type: "text",
          default: "Volume pricing for verified business accounts",
        },
        { key: "backgroundImage", label: "Background image", type: "image" },
      ],
    },
    {
      type: "featured-products",
      label: "Bulk-ready inventory",
      blocks: [],
      settings: [
        { key: "title", label: "Title", type: "text", default: "Reorder your top SKUs" },
        { key: "collectionHandle", label: "Collection", type: "text", default: "bulk-essentials" },
      ],
    },
    {
      type: "rich-text",
      label: "Company account callout",
      blocks: ["heading", "text"],
      settings: [],
    },
    {
      type: "image-with-text",
      label: "Request a quote panel",
      blocks: ["heading", "text", "button"],
      settings: [{ key: "image", label: "Image", type: "image" }],
    },
  ],
  blocks: [
    {
      type: "heading",
      label: "Heading",
      settings: [
        { key: "text", label: "Text", type: "text", default: "Trusted by 2,400+ business accounts" },
      ],
    },
    {
      type: "text",
      label: "Text",
      settings: [
        {
          key: "text",
          label: "Text",
          type: "richtext",
          default:
            "<p>Tiered volume pricing, dedicated account management, and net-30 terms for verified companies.</p>",
        },
      ],
    },
    {
      type: "button",
      label: "Button",
      settings: [
        { key: "label", label: "Label", type: "text", default: "Request a quote" },
        { key: "url", label: "Link", type: "url", default: "/collections/bulk-essentials" },
      ],
    },
  ],
  globalSettings: [
    { key: "primaryColor", label: "Primary color", type: "color", default: "#0f2a43" },
    { key: "secondaryColor", label: "Secondary color", type: "color", default: "#e7ecf1" },
    { key: "logoUrl", label: "Logo", type: "image" },
  ],
};

async function seedThemes(): Promise<void> {
  const foundation = await prisma.theme.upsert({
    where: { slug: "foundation" },
    update: {},
    create: {
      slug: "foundation",
      name: "Foundation",
      description: "The default Ocean theme: a clean, wholesale-ready starting point.",
      category: "general",
      status: "active",
    },
  });
  await prisma.themeRelease.upsert({
    where: { themeId_version: { themeId: foundation.id, version: "1.0.0" } },
    update: { manifest: FOUNDATION_MANIFEST },
    create: { themeId: foundation.id, version: "1.0.0", manifest: FOUNDATION_MANIFEST },
  });

  const wholesalePro = await prisma.theme.upsert({
    where: { slug: "wholesale-pro" },
    update: {},
    create: {
      slug: "wholesale-pro",
      name: "Wholesale Pro",
      description: "Built for B2B buyers: volume pricing callouts, company account messaging, and request-a-quote CTAs.",
      category: "wholesale",
      status: "active",
    },
  });
  await prisma.themeRelease.upsert({
    where: { themeId_version: { themeId: wholesalePro.id, version: "1.0.0" } },
    update: { manifest: WHOLESALE_PRO_MANIFEST },
    create: { themeId: wholesalePro.id, version: "1.0.0", manifest: WHOLESALE_PRO_MANIFEST },
  });
}

const PLANS = [
  {
    code: "starter",
    name: "Starter",
    description: "For a single store getting off the ground.",
    prices: { TRY: { monthly: 0, yearly: 0 } },
    sortOrder: 0,
    entitlements: { "stores.max": 1, "staff.max": 3, "products.max": 200 },
  },
  {
    code: "growth",
    name: "Growth",
    description: "For multi-store B2B operations.",
    prices: { TRY: { monthly: 149900, yearly: 1499000 } },
    sortOrder: 1,
    entitlements: {
      "stores.max": 5,
      "staff.max": 20,
      "products.max": 10000,
      "feature.custom_domains": true,
    },
  },
  {
    code: "enterprise",
    name: "Enterprise",
    description: "For large organizations — contact sales.",
    prices: null,
    sortOrder: 2,
    entitlements: {
      "stores.max": 999999,
      "staff.max": 999999,
      "products.max": 999999,
      "feature.custom_domains": true,
      "feature.priority_support": true,
    },
  },
] as const;

async function seedBilling(): Promise<void> {
  for (const plan of PLANS) {
    const { entitlements, ...planData } = plan;
    const created = await prisma.plan.upsert({
      where: { code: plan.code },
      update: planData,
      create: planData,
    });
    for (const [key, value] of Object.entries(entitlements)) {
      await prisma.entitlement.upsert({
        where: { planId_key: { planId: created.id, key } },
        update: { value },
        create: { planId: created.id, key, value },
      });
    }
  }
  await prisma.featureFlag.upsert({
    where: { key: "beta.custom_domains" },
    update: {},
    create: {
      key: "beta.custom_domains",
      description: "Custom domain support (rolling out)",
      defaultOn: false,
    },
  });
}

// ---------------------------------------------------------------------------
// Global Localization: Country Engine (L1 foundation) — real, complete CountryProfile rows for
// the 4 worked examples in the spec. Every field a future onboarding-form/address-form phase
// needs lives in these JSON columns; nothing here is a per-country code branch, just data.
// ---------------------------------------------------------------------------

const US_STATES = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"],
  ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"],
  ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"],
  ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"],
  ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"],
  ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"],
  ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"],
  ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"],
  ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"],
  ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"],
  ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"],
  ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"],
  ["WI", "Wisconsin"], ["WY", "Wyoming"],
].map(([value, label]) => ({ value, label }));

const COUNTRY_PROFILES = [
  {
    countryCode: "TR",
    name: "Türkiye",
    isActive: true,
    version: "2026.09",
    supportedCurrencies: ["TRY"],
    supportedLanguages: ["tr", "en"],
    addressSchema: [
      { key: "neighborhood", label: "Mahalle", type: "text", required: true },
      { key: "address1", label: "Açık Adres", type: "text", required: true, maxLength: 200 },
      { key: "district", label: "İlçe", type: "text", required: true },
      { key: "province", label: "İl", type: "text", required: true },
      { key: "postalCode", label: "Posta Kodu", type: "text", required: true },
    ],
    postalCodeRules: { regex: "^\\d{5}$", example: "34000", description: "5 haneli posta kodu" },
    stateProvinceRequired: true,
    stateProvinceLabel: "İl",
    taxSystemType: "vat",
    taxTerminology: { localName: "KDV", localFullName: "Katma Değer Vergisi", englishName: "VAT" },
    taxIdFormats: [
      {
        code: "VKN",
        label: "Vergi Kimlik Numarası",
        regex: "^\\d{10}$",
        example: "1234567890",
        description: "10 haneli kurumsal vergi kimlik numarası",
        appliesToEntityTypes: ["limited_sirket", "anonim_sirket", "adi_ortaklik", "kooperatif", "dernek_vakif"],
      },
      {
        code: "TCKN",
        label: "T.C. Kimlik Numarası",
        regex: "^\\d{11}$",
        example: "12345678901",
        description: "Şahıs işletmeleri için 11 haneli T.C. kimlik numarası",
        appliesToEntityTypes: ["sahis_isletmesi"],
      },
    ],
    supportedPaymentMethods: ["credit_card", "bank_transfer", "havale_eft", "cash_on_delivery"],
    businessEntityTypes: [
      { code: "sahis_isletmesi", label: "Şahıs İşletmesi" },
      { code: "limited_sirket", label: "Limited Şirket" },
      { code: "anonim_sirket", label: "Anonim Şirket" },
      { code: "adi_ortaklik", label: "Adi Ortaklık" },
      { code: "kooperatif", label: "Kooperatif" },
      { code: "dernek_vakif", label: "Dernek/Vakıf" },
    ],
    businessProfileSchema: [
      { key: "legalBusinessName", label: "Yasal İşletme Adı", required: true, inputType: "text" },
      { key: "tradeName", label: "Ticari Unvan", required: false, inputType: "text" },
      {
        key: "vkn",
        label: "VKN (Vergi Kimlik Numarası)",
        required: true,
        inputType: "text",
        validationRegex: "^\\d{10}$",
        placeholder: "1234567890",
        visibilityRules: { entityTypeIn: ["limited_sirket", "anonim_sirket", "adi_ortaklik", "kooperatif", "dernek_vakif"] },
      },
      {
        key: "tckn",
        label: "TCKN (T.C. Kimlik Numarası)",
        required: true,
        inputType: "text",
        validationRegex: "^\\d{11}$",
        placeholder: "12345678901",
        visibilityRules: { entityTypeIn: ["sahis_isletmesi"] },
      },
      { key: "taxOffice", label: "Vergi Dairesi", required: true, inputType: "text" },
      {
        key: "mersisNumber",
        label: "MERSİS Numarası",
        required: false,
        inputType: "text",
        validationRegex: "^\\d{16}$",
        visibilityRules: { entityTypeIn: ["limited_sirket", "anonim_sirket"] },
      },
      {
        key: "tradeRegistryNumber",
        label: "Ticaret Sicil No",
        required: false,
        inputType: "text",
        visibilityRules: { entityTypeIn: ["limited_sirket", "anonim_sirket", "kooperatif"] },
      },
      { key: "authorizedRepresentativeName", label: "Yetkili Temsilci Adı Soyadı", required: true, inputType: "text" },
      { key: "phone", label: "Telefon", required: true, inputType: "phone" },
      { key: "email", label: "E-posta", required: true, inputType: "email" },
    ],
  },
  {
    countryCode: "US",
    name: "United States",
    isActive: true,
    version: "2026.09",
    supportedCurrencies: ["USD"],
    supportedLanguages: ["en", "es"],
    addressSchema: [
      { key: "address1", label: "Street Address", type: "text", required: true },
      { key: "address2", label: "Apt / Suite", type: "text", required: false },
      { key: "city", label: "City", type: "text", required: true },
      { key: "state", label: "State", type: "select", required: true, options: US_STATES },
      { key: "zip", label: "ZIP Code", type: "text", required: true },
    ],
    postalCodeRules: { regex: "^\\d{5}(-\\d{4})?$", example: "10001", description: "5-digit ZIP code, optionally ZIP+4" },
    stateProvinceRequired: true,
    stateProvinceLabel: "State",
    taxSystemType: "sales_tax",
    taxTerminology: { localName: "Sales Tax", englishName: "Sales Tax" },
    taxIdFormats: [
      {
        code: "EIN",
        label: "Employer Identification Number",
        regex: "^\\d{2}-\\d{7}$",
        example: "12-3456789",
        description: "Federal tax ID for registered businesses",
        appliesToEntityTypes: ["llc", "corporation", "partnership", "non_profit"],
      },
      {
        code: "SSN",
        label: "Social Security Number",
        regex: "^\\d{3}-\\d{2}-\\d{4}$",
        example: "123-45-6789",
        description: "Used by individuals / sole proprietors without an EIN",
        appliesToEntityTypes: ["individual_sole_proprietorship"],
      },
    ],
    supportedPaymentMethods: ["credit_card", "ach_bank_transfer", "paypal"],
    businessEntityTypes: [
      { code: "individual_sole_proprietorship", label: "Individual / Sole Proprietorship" },
      { code: "llc", label: "LLC" },
      { code: "corporation", label: "Corporation" },
      { code: "partnership", label: "Partnership" },
      { code: "non_profit", label: "Non-profit" },
    ],
    businessProfileSchema: [
      { key: "legalBusinessName", label: "Legal Business Name", required: true, inputType: "text" },
      { key: "dba", label: "DBA (Doing Business As)", required: false, inputType: "text" },
      {
        key: "ein",
        label: "EIN (Employer Identification Number)",
        required: true,
        inputType: "text",
        validationRegex: "^\\d{2}-\\d{7}$",
        placeholder: "12-3456789",
        visibilityRules: { entityTypeIn: ["llc", "corporation", "partnership", "non_profit"] },
      },
      {
        key: "ssn",
        label: "SSN (Social Security Number)",
        required: true,
        inputType: "text",
        validationRegex: "^\\d{3}-\\d{2}-\\d{4}$",
        placeholder: "123-45-6789",
        visibilityRules: { entityTypeIn: ["individual_sole_proprietorship"] },
      },
      {
        key: "stateOfFormation",
        label: "State of Formation",
        required: false,
        inputType: "select",
        options: US_STATES,
        visibilityRules: { entityTypeIn: ["llc", "corporation", "partnership", "non_profit"] },
      },
      { key: "registrationNumber", label: "State Registration Number", required: false, inputType: "text" },
      { key: "authorizedRepresentativeName", label: "Authorized Representative Name", required: true, inputType: "text" },
      { key: "phone", label: "Phone", required: true, inputType: "phone" },
      { key: "email", label: "Email", required: true, inputType: "email" },
    ],
  },
  {
    countryCode: "GB",
    name: "United Kingdom",
    isActive: true,
    version: "2026.09",
    supportedCurrencies: ["GBP"],
    supportedLanguages: ["en"],
    addressSchema: [
      { key: "address1", label: "Address Line 1", type: "text", required: true },
      { key: "address2", label: "Address Line 2", type: "text", required: false },
      { key: "townCity", label: "Town / City", type: "text", required: true },
      { key: "county", label: "County", type: "text", required: false },
      { key: "postcode", label: "Postcode", type: "text", required: true },
    ],
    postalCodeRules: {
      regex: "^[A-Z]{1,2}\\d[A-Z\\d]?\\s?\\d[A-Z]{2}$",
      example: "SW1A 1AA",
      description: "UK postcode format",
    },
    stateProvinceRequired: false,
    stateProvinceLabel: "County",
    taxSystemType: "vat",
    taxTerminology: { localName: "VAT", localFullName: "Value Added Tax", englishName: "VAT" },
    taxIdFormats: [
      {
        code: "COMPANY_NUMBER",
        label: "Company Number",
        regex: "^([A-Z]{2}\\d{6}|\\d{8})$",
        example: "12345678",
        description: "Companies House registration number",
        appliesToEntityTypes: ["limited_company", "llp", "charity"],
      },
      {
        code: "VAT_NUMBER",
        label: "VAT Registration Number",
        regex: "^GB\\d{9}$",
        example: "GB123456789",
        description: "HMRC VAT registration number",
      },
    ],
    supportedPaymentMethods: ["credit_card", "bacs_bank_transfer", "paypal"],
    businessEntityTypes: [
      { code: "sole_trader", label: "Sole Trader" },
      { code: "limited_company", label: "Limited Company" },
      { code: "partnership", label: "Partnership" },
      { code: "llp", label: "LLP" },
      { code: "charity", label: "Charity" },
    ],
    businessProfileSchema: [
      { key: "legalBusinessName", label: "Legal Business Name", required: true, inputType: "text" },
      { key: "tradingName", label: "Trading Name", required: false, inputType: "text" },
      {
        key: "companyNumber",
        label: "Company Number",
        required: true,
        inputType: "text",
        validationRegex: "^([A-Z]{2}\\d{6}|\\d{8})$",
        placeholder: "12345678",
        visibilityRules: { entityTypeIn: ["limited_company", "llp", "charity"] },
      },
      {
        key: "vatNumber",
        label: "VAT Registration Number",
        required: false,
        inputType: "text",
        validationRegex: "^GB\\d{9}$",
        placeholder: "GB123456789",
      },
      {
        key: "businessAddressSameAsRegistered",
        label: "Business address same as registered address",
        required: false,
        inputType: "checkbox",
      },
      { key: "authorizedRepresentativeName", label: "Authorized Representative Name", required: true, inputType: "text" },
      { key: "phone", label: "Phone", required: true, inputType: "phone" },
      { key: "email", label: "Email", required: true, inputType: "email" },
    ],
  },
  {
    countryCode: "DE",
    name: "Germany",
    isActive: true,
    version: "2026.09",
    supportedCurrencies: ["EUR"],
    supportedLanguages: ["de", "en"],
    addressSchema: [
      { key: "street", label: "Straße", type: "text", required: true },
      { key: "houseNumber", label: "Hausnummer", type: "text", required: true },
      { key: "postalCode", label: "PLZ", type: "text", required: true },
      { key: "city", label: "Stadt", type: "text", required: true },
      { key: "state", label: "Bundesland", type: "text", required: false },
    ],
    postalCodeRules: { regex: "^\\d{5}$", example: "10115", description: "5-stellige Postleitzahl" },
    stateProvinceRequired: false,
    stateProvinceLabel: "Bundesland",
    taxSystemType: "vat",
    taxTerminology: { localName: "MwSt", localFullName: "Mehrwertsteuer", englishName: "VAT" },
    taxIdFormats: [
      {
        code: "HANDELSREGISTERNUMMER",
        label: "Handelsregisternummer",
        regex: "^HRB\\s?\\d+$",
        example: "HRB 123456",
        description: "Commercial register number (Handelsregister)",
        appliesToEntityTypes: ["gmbh", "ug", "ag", "ohg_kg"],
      },
      {
        code: "USTIDNR",
        label: "Umsatzsteuer-Identifikationsnummer (USt-IdNr.)",
        regex: "^DE\\d{9}$",
        example: "DE123456789",
        description: "EU VAT identification number",
      },
      {
        code: "STEUERNUMMER",
        label: "Steuernummer",
        example: "12/345/67890",
        description: "Local tax office reference number",
      },
    ],
    supportedPaymentMethods: ["credit_card", "sepa_bank_transfer", "paypal", "invoice"],
    businessEntityTypes: [
      { code: "einzelunternehmen", label: "Einzelunternehmen" },
      { code: "gbr", label: "GbR" },
      { code: "gmbh", label: "GmbH" },
      { code: "ug", label: "UG (haftungsbeschränkt)" },
      { code: "ag", label: "AG" },
      { code: "ohg_kg", label: "OHG/KG" },
    ],
    businessProfileSchema: [
      { key: "legalCompanyName", label: "Firmenname (Legal Company Name)", required: true, inputType: "text" },
      {
        key: "businessType",
        label: "Unternehmensform (Business Type)",
        required: true,
        inputType: "select",
        options: [
          { value: "einzelunternehmen", label: "Einzelunternehmen" },
          { value: "gbr", label: "GbR" },
          { value: "gmbh", label: "GmbH" },
          { value: "ug", label: "UG (haftungsbeschränkt)" },
          { value: "ag", label: "AG" },
          { value: "ohg_kg", label: "OHG/KG" },
        ],
      },
      {
        key: "handelsregisternummer",
        label: "Handelsregisternummer",
        required: false,
        inputType: "text",
        validationRegex: "^HRB\\s?\\d+$",
        placeholder: "HRB 123456",
        visibilityRules: { entityTypeIn: ["gmbh", "ug", "ag", "ohg_kg"] },
      },
      {
        key: "vatId",
        label: "USt-IdNr. (VAT ID)",
        required: false,
        inputType: "text",
        validationRegex: "^DE\\d{9}$",
        placeholder: "DE123456789",
      },
      { key: "taxNumber", label: "Steuernummer (Tax Number)", required: true, inputType: "text" },
      { key: "authorizedRepresentativeName", label: "Vertretungsberechtigte Person", required: true, inputType: "text" },
      { key: "phone", label: "Telefon", required: true, inputType: "phone" },
      { key: "email", label: "E-Mail", required: true, inputType: "email" },
    ],
  },
] as const;

async function seedCountryProfiles(): Promise<void> {
  for (const profile of COUNTRY_PROFILES) {
    const { countryCode, ...data } = profile;
    await prisma.countryProfile.upsert({
      where: { countryCode },
      update: data,
      create: { countryCode, ...data },
    });
  }
}

async function seedPlatformOperator(): Promise<void> {
  const passwordHash = await hash(PLATFORM_OPERATOR_PASSWORD, {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
  // Seeded as "admin" (not the schema default of "viewer") so this account — the one
  // apps/platform-admin's own login screen and this repo's manual/verification testing use — can
  // still exercise every mutating platform route, same as it always implicitly could before
  // PlatformOperatorRole existed.
  await prisma.platformOperator.upsert({
    where: { email: PLATFORM_OPERATOR_EMAIL },
    update: { passwordHash, status: "active", role: "admin" },
    create: {
      email: PLATFORM_OPERATOR_EMAIL,
      name: "Ocean Platform Ops",
      passwordHash,
      role: "admin",
    },
  });
}

async function main(): Promise<void> {
  await seedThemes();
  await seedBilling();
  await seedCountryProfiles();
  await seedPlatformOperator();

  const passwordHash = await hash(DEMO_PASSWORD, {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { passwordHash, emailVerifiedAt: new Date() },
    create: {
      email: DEMO_EMAIL,
      name: "Demo Owner",
      passwordHash,
      emailVerifiedAt: new Date(),
    },
  });

  const organization = await prisma.organization.upsert({
    where: { slug: "demo-holding" },
    update: {},
    create: { name: "Demo Holding", slug: "demo-holding" },
  });

  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
    update: { role: "owner", status: "active" },
    create: { organizationId: organization.id, userId: user.id, role: "owner" },
  });

  const store = await prisma.store.upsert({
    where: { slug: "demo-wholesale" },
    update: {},
    create: {
      organizationId: organization.id,
      name: "Demo Wholesale",
      slug: "demo-wholesale",
      defaultCurrency: "TRY",
      defaultLocale: "tr",
      timezone: "Europe/Istanbul",
      businessType: "wholesale",
      industry: "industrial_supplies",
    },
  });

  await prisma.storeMember.upsert({
    where: { storeId_userId: { storeId: store.id, userId: user.id } },
    update: { role: "store_owner", status: "active" },
    create: {
      storeId: store.id,
      organizationId: organization.id,
      userId: user.id,
      role: "store_owner",
    },
  });

  console.warn(`Seeded ${DEMO_EMAIL} / ${DEMO_PASSWORD} -> ${organization.slug} / ${store.slug}`);
  console.warn(`Seeded platform operator ${PLATFORM_OPERATOR_EMAIL} / ${PLATFORM_OPERATOR_PASSWORD}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
