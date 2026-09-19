import { Button, CheckIcon } from "@ocean/ui";
import type { Metadata } from "next";
import Link from "next/link";

import { CtaBand } from "@/components/cta-band";
import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = {
  title: "Enterprise",
  description:
    "SSO, custom roles, expanded audit logging, bulk export, and priority support for organizations running Ocean Commerce at scale.",
};

const capabilities = [
  {
    title: "Single sign-on",
    body: "Connect your identity provider so staff sign in through your existing SSO, and access is revoked the moment they leave your identity system.",
  },
  {
    title: "Custom roles",
    body: "Go beyond built-in staff roles and define custom roles with exactly the permissions a team needs across stores, orders, pricing, and settings.",
  },
  {
    title: "Expanded audit log",
    body: "Every sensitive action — permission changes, price list edits, credit limit changes, impersonation — is recorded with who, what, and when.",
  },
  {
    title: "Bulk export",
    body: "Export orders, customers, products, and pricing data in bulk for reporting, migrations, or feeding your data warehouse.",
  },
  {
    title: "Support impersonation, with a trail",
    body: "When support needs to see what a staff member sees to resolve an issue, impersonation sessions are scoped, time-limited, and fully logged in the audit trail.",
  },
  {
    title: "Unlimited scale",
    body: "Unlimited stores, staff accounts, and products on the Enterprise plan, with pricing built around your actual order volume and support needs.",
  },
];

export default function EnterprisePage() {
  return (
    <>
      <PageHero
        eyebrow="Enterprise"
        title="Governance and scale for larger organizations"
        description="SSO, custom roles, expanded audit logging, and bulk export for teams running multiple stores and multiple approval chains."
      >
        <Link href="mailto:sales@oceancommerce.example">
          <Button size="lg">Contact sales</Button>
        </Link>
        <Link href="/pricing">
          <Button size="lg" variant="outline">
            Compare plans
          </Button>
        </Link>
      </PageHero>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((item) => (
            <div key={item.title} className="rounded-lg border bg-card p-6 shadow-card">
              <h2 className="text-base font-semibold">{item.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t bg-canvas">
        <div className="mx-auto max-w-4xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight">What Enterprise adds on top of Growth</h2>
          <ul className="mt-6 flex flex-col gap-4">
            {[
              "Unlimited stores, staff accounts, and products, priced against your actual usage.",
              "Single sign-on for staff, with access tied to your identity provider.",
              "Custom staff roles with granular, per-resource permissions.",
              "An expanded audit log covering permission, pricing, and credit changes.",
              "Bulk data export for orders, customers, products, and pricing.",
              "Priority support with a named account contact.",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <CheckIcon size={18} className="mt-0.5 shrink-0 text-success" />
                <span className="text-foreground/90">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <CtaBand
        title="Talk to us about your rollout"
        description="Tell us how many stores and staff you're running today, and we'll put together an Enterprise quote."
      />
    </>
  );
}
