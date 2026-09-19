import { Badge, Button, CheckIcon } from "@ocean/ui";
import type { Metadata } from "next";
import Link from "next/link";

import { CtaBand } from "@/components/cta-band";
import { ADMIN_URL } from "@/components/nav-links";
import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Ocean Commerce pricing: a free Starter plan, Growth for multi-store B2B operations, and Enterprise for large organizations.",
};

type Plan = {
  code: string;
  name: string;
  description: string;
  price: string;
  cadence: string;
  cta: string;
  href: string;
  highlighted?: boolean;
  entitlements: string[];
};

const plans: Plan[] = [
  {
    code: "starter",
    name: "Starter",
    description: "For a single store getting off the ground.",
    price: "Free",
    cadence: "forever",
    cta: "Start free",
    href: `${ADMIN_URL}/signup`,
    entitlements: [
      "1 store",
      "Up to 3 staff accounts",
      "Up to 200 products",
      "Company accounts & B2B pricing",
      "Quotes, credit limits & approvals",
      "Storefront theme editor",
    ],
  },
  {
    code: "growth",
    name: "Growth",
    description: "For multi-store B2B operations.",
    price: "₺1,499",
    cadence: "/month, billed monthly",
    cta: "Start free trial",
    href: `${ADMIN_URL}/signup?plan=growth`,
    highlighted: true,
    entitlements: [
      "Everything in Starter, plus:",
      "Up to 5 stores",
      "Up to 20 staff accounts",
      "Up to 10,000 products",
      "Custom domains",
      "Volume pricing & price lists at scale",
    ],
  },
  {
    code: "enterprise",
    name: "Enterprise",
    description: "For large organizations — contact sales.",
    price: "Custom",
    cadence: "annual contract",
    cta: "Contact sales",
    href: "/enterprise",
    entitlements: [
      "Everything in Growth, plus:",
      "Unlimited stores",
      "Unlimited staff accounts",
      "Unlimited products",
      "Custom domains",
      "Priority support",
      "SSO & custom roles",
    ],
  },
];

const faqs = [
  {
    q: "Is there a free plan?",
    a: "Yes. Starter is free forever for a single store with up to 3 staff accounts and 200 products, including B2B features like company accounts, quotes, and credit limits. You don't need a credit card to sign up.",
  },
  {
    q: "What happens if I go over a plan limit?",
    a: "We'll let you know as you approach a limit (stores, staff, or products) and prompt you to upgrade. We don't cut off your storefront without warning.",
  },
  {
    q: "Can I pay yearly?",
    a: "Growth is billed monthly at ₺1,499 or yearly at ₺14,990 — roughly two months free compared to paying monthly. Enterprise is billed on an annual contract.",
  },
  {
    q: "Do all plans include B2B features?",
    a: "Yes. Company accounts, customer-specific pricing, volume pricing, quotes, credit limits, payment terms, and order approvals are available on every plan, including Starter. Higher plans raise your limits and add custom domains, priority support, SSO, and custom roles.",
  },
  {
    q: "How is Enterprise priced?",
    a: "Enterprise is a custom annual contract based on store count, order volume, and support needs. Talk to us and we'll put together a quote.",
  },
];

export default function PricingPage() {
  return (
    <>
      <PageHero
        eyebrow="Pricing"
        title="Plans that grow with your catalog, not against it"
        description="Start free on a single store. Move to Growth when you're running multiple stores or need custom domains. Move to Enterprise when you need scale, SSO, and priority support."
      />

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-6 lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.code}
              className={
                plan.highlighted
                  ? "relative rounded-xl border-2 border-primary bg-card p-8 shadow-popover"
                  : "relative rounded-xl border bg-card p-8 shadow-card"
              }
            >
              {plan.highlighted && (
                <Badge className="absolute -top-3 left-8" variant="default">
                  Most popular
                </Badge>
              )}
              <h2 className="text-lg font-semibold">{plan.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
              <div className="mt-6 flex items-baseline gap-1.5">
                <span className="text-4xl font-semibold tracking-tight">{plan.price}</span>
                <span className="text-sm text-muted-foreground">{plan.cadence}</span>
              </div>
              <Link href={plan.href} className="mt-6 block">
                <Button className="w-full" variant={plan.highlighted ? "primary" : "outline"}>
                  {plan.cta}
                </Button>
              </Link>
              <ul className="mt-8 flex flex-col gap-3 text-sm">
                {plan.entitlements.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckIcon size={16} className="mt-0.5 shrink-0 text-success" />
                    <span className={item.endsWith(":") ? "font-medium text-foreground" : "text-foreground/90"}>
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          All prices in Turkish lira (₺), excluding applicable taxes. Payment processing and
          usage-based add-ons are billed separately.
        </p>
      </section>

      <section className="border-t bg-canvas">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <h2 className="text-center text-3xl font-semibold tracking-tight">
            Frequently asked questions
          </h2>
          <div className="mt-10 flex flex-col divide-y">
            {faqs.map((faq) => (
              <div key={faq.q} className="py-6">
                <h3 className="font-medium">{faq.q}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaBand
        title="Not sure which plan fits?"
        description="Start free on Starter — every B2B feature is included from day one. Upgrade when you add stores or staff."
      />
    </>
  );
}
