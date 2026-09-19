import { Badge } from "@ocean/ui";
import type { Metadata } from "next";

import { CtaBand } from "@/components/cta-band";
import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = {
  title: "Customers",
  description:
    "How B2B and wholesale companies use Ocean Commerce to run company accounts, pricing, and quotes. Illustrative examples of platform capability.",
};

const stories = [
  {
    name: "Anadolu Endüstriyel Tedarik",
    industry: "Industrial supplies distribution",
    summary:
      "Moved 40 regional dealer accounts from phone and fax ordering onto price-list-scoped storefronts, each with its own negotiated pricing and credit terms.",
    quote:
      "Every dealer used to call in for a price. Now they log in, see their contract pricing, and place the order themselves.",
    person: "Operations lead (illustrative)",
    stats: [
      { label: "Dealer accounts migrated", value: "40" },
      { label: "Price lists in use", value: "18" },
    ],
  },
  {
    name: "Kuzey Yapı Malzemeleri",
    industry: "Building materials wholesale",
    summary:
      "Replaced a spreadsheet-based quantity pricing sheet with quantity-tier volume pricing and a draft-order workflow for phone orders from job sites.",
    quote:
      "Our sales team takes the same phone orders they always did, but now they're built with the real catalog and pricing instead of a paper sheet.",
    person: "Sales manager (illustrative)",
    stats: [
      { label: "Draft orders / month", value: "600+" },
      { label: "Warehouses tracked", value: "3" },
    ],
  },
  {
    name: "Marmara Ofis Çözümleri",
    industry: "Office equipment B2B & DTC",
    summary:
      "Runs one company account catalog for corporate clients with approval workflows above ₺50,000, alongside a public DTC storefront on the same platform.",
    quote:
      "We didn't want two systems — one for wholesale accounts and one for retail. Ocean Commerce runs both from the same catalog.",
    person: "Founder (illustrative)",
    stats: [
      { label: "Approval threshold", value: "₺50,000" },
      { label: "Storefronts on one org", value: "2" },
    ],
  },
];

export default function CustomersPage() {
  return (
    <>
      <PageHero
        eyebrow="Customers"
        title="Illustrative examples of Ocean Commerce in use"
        description="These are representative, fictional scenarios written to show how the platform's features fit together for B2B and wholesale businesses — not verified customer endorsements."
      />

      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="flex flex-col gap-8">
          {stories.map((story) => (
            <div key={story.name} className="rounded-xl border bg-card p-8 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">{story.name}</h2>
                  <p className="text-sm text-muted-foreground">{story.industry}</p>
                </div>
                <Badge variant="outline">Illustrative example</Badge>
              </div>
              <p className="mt-4 text-foreground/90">{story.summary}</p>
              <blockquote className="mt-4 border-l-2 border-border pl-4 text-sm italic text-muted-foreground">
                "{story.quote}"
                <footer className="mt-1 not-italic">— {story.person}</footer>
              </blockquote>
              <div className="mt-6 flex flex-wrap gap-8 border-t pt-6">
                {story.stats.map((stat) => (
                  <div key={stat.label}>
                    <p className="text-2xl font-semibold tracking-tight">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-xs text-muted-foreground">
          Company names and figures above are fictional examples created to illustrate typical
          use of the platform, not real customers of Ocean Commerce.
        </p>
      </section>

      <CtaBand
        title="Be one of our first real customer stories"
        description="Start free, set up your first company account and price list, and tell us how it goes."
      />
    </>
  );
}
