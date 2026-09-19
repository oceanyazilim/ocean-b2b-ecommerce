import { hash } from "@node-rs/argon2";

import { PrismaClient } from "../generated/client";

const prisma = new PrismaClient();

const DEMO_EMAIL = "owner@demo.local";
const DEMO_PASSWORD = "DemoPass123!";

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

async function main(): Promise<void> {
  await seedThemes();
  await seedBilling();

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
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
