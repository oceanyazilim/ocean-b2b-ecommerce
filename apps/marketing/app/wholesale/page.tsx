import { Button, CheckIcon, InventoryIcon, OrdersIcon, PricingIcon } from "@ocean/ui";
import type { Metadata } from "next";
import Link from "next/link";

import { CtaBand } from "@/components/cta-band";
import { ADMIN_URL } from "@/components/nav-links";
import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = {
  title: "Wholesale Commerce",
  description:
    "Volume pricing, price lists, draft orders, and multi-location inventory for wholesale and distribution businesses on Ocean Commerce.",
};

const pillars = [
  {
    icon: PricingIcon,
    title: "Volume pricing that scales with quantity",
    body: "Set quantity-tier break pricing on any product, layer price lists per customer group, and preview the effect on a real cart with the pricing simulator before you roll it out.",
  },
  {
    icon: OrdersIcon,
    title: "Draft orders for phone and email business",
    body: "Wholesale doesn't stop at the storefront. Build a draft order for a phone-in or email order, adjust pricing manually, and convert it to a real order and invoice.",
  },
  {
    icon: InventoryIcon,
    title: "Multi-location inventory",
    body: "Track stock across every warehouse and store location, log inventory movements, and transfer stock between locations as orders and replenishment demand it.",
  },
];

export default function WholesalePage() {
  return (
    <>
      <PageHero
        eyebrow="Wholesale"
        title="Built for the way distributors actually sell"
        description="Volume pricing, price lists, draft orders, and multi-location inventory — the operational core wholesale businesses need, not a consumer store with a minimum order quantity bolted on."
      >
        <Link href={`${ADMIN_URL}/signup`}>
          <Button size="lg">Start free</Button>
        </Link>
        <Link href="/b2b">
          <Button size="lg" variant="outline">
            See B2B features
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
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">
                Pricing that doesn't need a spreadsheet on the side
              </h2>
              <p className="mt-4 text-muted-foreground">
                Wholesale pricing is rarely one number. Ocean Commerce handles the layers:
                a base price list, quantity-tier volume pricing on top, and a negotiated
                contract price that overrides both when one exists — all applied automatically
                at checkout, and all previewable in the pricing simulator before you publish.
              </p>
            </div>
            <div className="rounded-lg border bg-card shadow-card">
              <div className="border-b px-5 py-3 text-xs font-medium text-muted-foreground">
                Example: quantity pricing
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-5 py-2 font-medium">Quantity</th>
                    <th className="px-5 py-2 font-medium">Unit price</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["1–9 units", "List price"],
                    ["10–49 units", "-8%"],
                    ["50–199 units", "-15%"],
                    ["200+ units", "Contract price"],
                  ].map(([qty, price]) => (
                    <tr key={qty} className="border-b last:border-0">
                      <td className="px-5 py-3">{qty}</td>
                      <td className="px-5 py-3 text-muted-foreground">{price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-20">
        <h2 className="text-2xl font-semibold tracking-tight">What distributors get on day one</h2>
        <ul className="mt-6 flex flex-col gap-4">
          {[
            "Quantity break pricing configured per product, applied automatically at any order size.",
            "Price lists assigned per customer group so different buyers see different pricing.",
            "Draft orders for taking phone and email orders through the same catalog and pricing engine.",
            "Multi-location inventory with movement history and stock transfers between locations.",
            "Order approval workflows for large orders that need sign-off before they ship.",
            "The same customer-facing storefront and theme editor as any other store on the platform.",
          ].map((item) => (
            <li key={item} className="flex items-start gap-3">
              <CheckIcon size={18} className="mt-0.5 shrink-0 text-success" />
              <span className="text-foreground/90">{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <CtaBand
        title="Put your price book online"
        description="Set up quantity pricing, price lists, and multi-location inventory without a spreadsheet in sight."
      />
    </>
  );
}
