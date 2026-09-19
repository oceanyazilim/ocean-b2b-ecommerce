import { Button } from "@ocean/ui";
import type { Metadata } from "next";
import Link from "next/link";

import { CtaBand } from "@/components/cta-band";
import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = {
  title: "Integrations",
  description:
    "Connect Ocean Commerce to payments, shipping, taxes, and your back office using native settings and the developer platform's API and webhooks.",
};

const native = [
  { title: "Payment methods", body: "Configure the payment methods your store accepts directly from Settings → Payment methods." },
  { title: "Shipping", body: "Set up shipping zones and rates per store from Settings → Shipping." },
  { title: "Taxes", body: "Configure tax rules per store and per region from Settings → Taxes." },
];

const build = [
  { title: "ERP & accounting", body: "Sync orders and customers to your ERP or accounting system with the order.created and customer webhooks and the orders/customers API scopes." },
  { title: "Fulfillment & 3PL", body: "Push new orders to a fulfillment partner and pull tracking updates back in through an OAuth app or scoped API key." },
  { title: "Data warehouse & BI", body: "Feed products, orders, and pricing into your own reporting stack via the API, or use bulk export on the Enterprise plan." },
];

export default function IntegrationsPage() {
  return (
    <>
      <PageHero
        eyebrow="Integrations"
        title="Connect the systems around your storefront"
        description="Payments, shipping, and taxes are configured natively. Everything else — ERP, fulfillment, and reporting — connects through the developer platform's API and webhooks."
      >
        <Link href="/developers">
          <Button size="lg">See the developer platform</Button>
        </Link>
      </PageHero>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-2xl font-semibold tracking-tight">Configured natively, per store</h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          {native.map((item) => (
            <div key={item.title} className="rounded-lg border bg-card p-6 shadow-card">
              <h3 className="font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t bg-canvas">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">Build with the API</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            We don't maintain a one-click integration marketplace yet — instead, every integration
            is built on the same OAuth apps, API keys, and webhooks that power our own admin.
          </p>
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            {build.map((item) => (
              <div key={item.title} className="rounded-lg border bg-card p-6 shadow-card">
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaBand
        title="Have a system you need to connect?"
        description="Our developer platform covers products, orders, customers, pricing, and quotes — start with the API docs."
      />
    </>
  );
}
