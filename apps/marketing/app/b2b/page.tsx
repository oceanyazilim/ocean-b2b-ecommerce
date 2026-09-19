import { Button, CheckIcon, CompaniesIcon, PricingIcon, QuotesIcon } from "@ocean/ui";
import type { Metadata } from "next";
import Link from "next/link";

import { CtaBand } from "@/components/cta-band";
import { ADMIN_URL } from "@/components/nav-links";
import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = {
  title: "B2B Commerce",
  description:
    "Company accounts, customer-specific pricing, credit limits, payment terms and order approval workflows — B2B commerce built into the core of Ocean Commerce.",
};

const pillars = [
  {
    icon: CompaniesIcon,
    title: "Company accounts, not just customer records",
    body: "Every buyer belongs to a company. Companies have locations, assigned buyers with purchasing roles, and their own catalog scope — the way B2B purchasing actually works, not a workaround bolted onto a DTC customer object.",
  },
  {
    icon: PricingIcon,
    title: "Pricing that matches the contract",
    body: "Assign price lists per company or customer group, apply quantity-tier volume pricing, and lock in negotiated contract pricing. Run a cart through the pricing simulator before you publish a change.",
  },
  {
    icon: QuotesIcon,
    title: "Quotes, credit, and approvals",
    body: "Buyers request quotes, sales applies discounts, finance sets a credit limit and payment terms per company, and purchases above a threshold route through a configurable approval chain before they're fulfilled.",
  },
];

const workflow = [
  {
    step: "01",
    title: "Onboard the company",
    body: "Create the company, add its locations, and invite buyers with role-based purchasing permissions.",
  },
  {
    step: "02",
    title: "Attach pricing",
    body: "Assign a price list or negotiated contract, layer on volume pricing, and scope the catalog to what they're allowed to buy.",
  },
  {
    step: "03",
    title: "Set terms",
    body: "Configure a credit limit, payment terms (net 30, net 60, or your own), and an approval threshold for large orders.",
  },
  {
    step: "04",
    title: "Buyers order",
    body: "Buyers browse their scoped catalog, request a quote or order directly, and orders over threshold wait for internal sign-off.",
  },
];

export default function B2BPage() {
  return (
    <>
      <PageHero
        eyebrow="B2B commerce"
        title="Purchasing works differently in B2B. Your platform should too."
        description="Company accounts, negotiated pricing, credit terms, and approval workflows are built into Ocean Commerce from the ground up — not simulated with tags and discount codes."
      >
        <Link href={`${ADMIN_URL}/signup`}>
          <Button size="lg">Start free</Button>
        </Link>
        <Link href="/wholesale">
          <Button size="lg" variant="outline">
            Compare with Wholesale
          </Button>
        </Link>
      </PageHero>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-6 lg:grid-cols-3">
          {pillars.map((pillar) => (
            <div key={pillar.title} className="rounded-lg border bg-card p-6 shadow-card">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent text-foreground">
                <pillar.icon size={20} />
              </div>
              <h2 className="mt-4 text-lg font-semibold">{pillar.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{pillar.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t bg-canvas">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight">
              From new company to first approved order
            </h2>
            <p className="mt-4 text-muted-foreground">
              A typical B2B rollout on Ocean Commerce takes four steps — no custom development
              required.
            </p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {workflow.map((step) => (
              <div key={step.step} className="rounded-lg border bg-card p-6 shadow-card">
                <span className="text-xs font-semibold text-muted-foreground">{step.step}</span>
                <h3 className="mt-2 font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-20">
        <h2 className="text-2xl font-semibold tracking-tight">
          What "B2B built in" actually means
        </h2>
        <ul className="mt-6 flex flex-col gap-4">
          {[
            "Company records with multiple locations and assigned buyers, not a single flat customer.",
            "Customer group and per-company price lists that override list price automatically at checkout.",
            "Quantity-based volume pricing with a simulator to preview totals before you publish a change.",
            "Credit limits and payment terms (net 30/60/custom) tracked per company.",
            "Order approval workflows that hold purchases above a threshold for internal sign-off.",
            "Custom catalogs that scope which products — and at what price — each company can even see.",
          ].map((item) => (
            <li key={item} className="flex items-start gap-3">
              <CheckIcon size={18} className="mt-0.5 shrink-0 text-success" />
              <span className="text-foreground/90">{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <CtaBand
        title="Give every company its own storefront experience"
        description="Set up your first company account, price list, and approval workflow in minutes."
      />
    </>
  );
}
