import {
  AnalyticsIcon,
  CatalogsIcon,
  CollectionsIcon,
  CompaniesIcon,
  CustomersIcon,
  InventoryIcon,
  OrdersIcon,
  PricingIcon,
  ProductsIcon,
  QuotesIcon,
  SettingsIcon,
  StorefrontIcon,
} from "@ocean/ui";
import type { Metadata } from "next";

import { CtaBand } from "@/components/cta-band";
import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Catalog, pricing, quotes, inventory, storefront and developer tooling — everything Ocean Commerce ships for running B2B and wholesale stores.",
};

const groups = [
  {
    title: "Catalog & merchandising",
    description: "One catalog, shown differently to every company.",
    items: [
      {
        icon: ProductsIcon,
        title: "Products & variants",
        body: "Products with variants, media, and structured metafields for spec sheets, MOQs, or any custom data your catalog needs.",
      },
      {
        icon: CollectionsIcon,
        title: "Collections",
        body: "Group products manually or with rules, and reuse the same collections across storefront sections.",
      },
      {
        icon: CatalogsIcon,
        title: "Custom catalogs",
        body: "Scope which products (and at what price) a company or customer group can see and buy — hide the rest entirely.",
      },
    ],
  },
  {
    title: "B2B pricing & commerce",
    description: "Pricing that reflects the deal you actually negotiated.",
    items: [
      {
        icon: PricingIcon,
        title: "Price lists & contracts",
        body: "Assign price lists per company or customer group, and lock in negotiated contract pricing that overrides list price.",
      },
      {
        icon: CompaniesIcon,
        title: "Volume & quantity pricing",
        body: "Break pricing by quantity tier, simulate the effect on a cart before you publish it, and audit results with the pricing simulator.",
      },
      {
        icon: QuotesIcon,
        title: "Quotes & approvals",
        body: "Buyers request quotes, staff apply discounts, and orders above a threshold route through a configurable approval workflow before they ship.",
      },
    ],
  },
  {
    title: "Operations",
    description: "The back office work that keeps orders moving.",
    items: [
      {
        icon: OrdersIcon,
        title: "Orders & draft orders",
        body: "Take phone and email orders as drafts, adjust pricing or shipping manually, then convert to a real order and invoice.",
      },
      {
        icon: InventoryIcon,
        title: "Multi-location inventory",
        body: "Track stock across warehouses and store locations, record movements, and transfer inventory between locations.",
      },
      {
        icon: CustomersIcon,
        title: "Companies & customers",
        body: "Company records with locations and assigned buyers, credit limits, payment terms, and individual customer profiles for DTC.",
      },
    ],
  },
  {
    title: "Store builder",
    description: "A storefront your customers actually want to use.",
    items: [
      {
        icon: StorefrontIcon,
        title: "Theme editor",
        body: "A section-based editor — hero, featured products, image with text, rich text — with live preview before you publish.",
      },
      {
        icon: SettingsIcon,
        title: "Custom domains & branding",
        body: "Connect your own domain and set per-store brand colors that flow through the storefront automatically.",
      },
      {
        icon: AnalyticsIcon,
        title: "Analytics",
        body: "Store-level analytics on orders, revenue, and catalog performance, scoped to each store in your organization.",
      },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <>
      <PageHero
        eyebrow="Features"
        title="Everything a B2B storefront needs, none of the workarounds"
        description="Catalog, pricing, quotes, inventory, and a real theme editor — built as one platform instead of stitched together from apps."
      />

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="flex flex-col gap-16">
          {groups.map((group) => (
            <div key={group.title}>
              <div className="max-w-xl">
                <h2 className="text-2xl font-semibold tracking-tight">{group.title}</h2>
                <p className="mt-2 text-muted-foreground">{group.description}</p>
              </div>
              <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((item) => (
                  <div key={item.title} className="rounded-lg border bg-card p-6 shadow-card">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent text-foreground">
                      <item.icon size={20} />
                    </div>
                    <h3 className="mt-4 text-base font-semibold">{item.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <CtaBand />
    </>
  );
}
