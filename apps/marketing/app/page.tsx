import {
  Badge,
  Button,
  CatalogsIcon,
  CompaniesIcon,
  PricingIcon,
  QuotesIcon,
  StorefrontIcon,
} from "@ocean/ui";
import Link from "next/link";

import { CtaBand } from "@/components/cta-band";
import { ADMIN_URL } from "@/components/nav-links";

const capabilities = [
  {
    icon: CompaniesIcon,
    title: "Company accounts",
    description:
      "Every buyer belongs to a company with its own locations, assigned buyers, and role-based purchasing limits — not just a customer record.",
  },
  {
    icon: PricingIcon,
    title: "Customer-specific pricing",
    description:
      "Price lists, quantity break pricing, and negotiated contracts apply automatically at checkout, per company, per product, per location.",
  },
  {
    icon: QuotesIcon,
    title: "Quotes, credit & approvals",
    description:
      "Buyers request quotes, finance sets credit limits and payment terms, and purchases above threshold route through an approval workflow.",
  },
  {
    icon: CatalogsIcon,
    title: "Custom catalogs",
    description:
      "Show each company only the products and prices they're contracted for, hide the rest, and manage it all from one product catalog.",
  },
  {
    icon: StorefrontIcon,
    title: "Theme editor & storefront",
    description:
      "A visual, section-based editor with live preview — drag in a hero, featured products, or rich text, publish, and connect a custom domain.",
  },
];

export default function HomePage() {
  return (
    <>
      <section className="border-b">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 py-24 text-center">
          <Badge variant="secondary">Multi-tenant B2B & wholesale commerce</Badge>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
            The commerce platform built for how B2B actually sells
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            Company accounts, negotiated pricing, quotes, credit terms, and order approvals —
            alongside a real storefront theme editor. One platform for every store your
            organization runs.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href={`${ADMIN_URL}/signup`}>
              <Button size="lg">Start free</Button>
            </Link>
            <Link href="/b2b">
              <Button size="lg" variant="outline">
                Explore B2B features
              </Button>
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            Free Starter plan, no credit card required. Upgrade when you outgrow it.
          </p>
        </div>
      </section>

      <section className="border-b bg-canvas">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Why teams switch
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              DTC platforms bolt B2B on. We started there.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Ocean Commerce is built around company accounts, negotiated pricing, and approval
              chains as first-class objects — not a plugin on top of a consumer cart.
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((item) => (
              <div key={item.title} className="rounded-lg border bg-card p-6 shadow-card">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent text-foreground">
                  <item.icon size={20} />
                </div>
                <h3 className="mt-4 text-base font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
              </div>
            ))}
            <Link
              href="/features"
              className="flex flex-col justify-between rounded-lg border border-dashed bg-transparent p-6 text-left transition-colors hover:bg-accent"
            >
              <span className="text-base font-semibold">See every feature</span>
              <span className="mt-2 text-sm text-muted-foreground">
                Inventory, drafts, multi-location, taxes, shipping, analytics, and more →
              </span>
            </Link>
          </div>
        </div>
      </section>

      <section className="border-b">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Store builder
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              A storefront that looks nothing like an admin panel
            </h2>
            <p className="mt-4 text-muted-foreground">
              Assemble pages from sections — hero, featured products, image with text, rich text —
              in a live preview editor. Set global colors and branding per store, publish when
              ready, and point a custom domain at it.
            </p>
            <div className="mt-6 flex gap-3">
              <Link href="/themes">
                <Button variant="outline">See the theme editor</Button>
              </Link>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-2 shadow-popover">
            <div className="rounded-lg border bg-canvas p-6">
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="mt-6 h-32 rounded-md bg-gradient-to-br from-accent to-muted" />
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="h-16 rounded-md bg-muted" />
                <div className="h-16 rounded-md bg-muted" />
                <div className="h-16 rounded-md bg-muted" />
              </div>
              <div className="mt-4 h-3 w-2/3 rounded bg-muted" />
              <div className="mt-2 h-3 w-1/2 rounded bg-muted" />
            </div>
          </div>
        </div>
      </section>

      <section className="border-b bg-canvas">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-10 lg:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Built to extend
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                A real API, not an afterthought
              </h2>
              <p className="mt-4 text-muted-foreground">
                OAuth apps, scoped API keys, and webhooks for the events that matter — order
                created, quote accepted, return requested — so your systems stay in sync.
              </p>
              <Link href="/developers" className="mt-4 inline-block text-sm font-medium underline">
                Read the developer docs →
              </Link>
            </div>
            <div className="lg:col-span-2 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border bg-card p-5 shadow-card">
                <p className="font-mono text-xs text-muted-foreground">POST /oauth/apps</p>
                <p className="mt-2 text-sm">Register an OAuth app with granular scopes.</p>
              </div>
              <div className="rounded-lg border bg-card p-5 shadow-card">
                <p className="font-mono text-xs text-muted-foreground">webhook: order.created</p>
                <p className="mt-2 text-sm">Push new orders to your ERP the moment they land.</p>
              </div>
              <div className="rounded-lg border bg-card p-5 shadow-card">
                <p className="font-mono text-xs text-muted-foreground">scope: pricing.read</p>
                <p className="mt-2 text-sm">Pull company-specific price lists into your tools.</p>
              </div>
              <div className="rounded-lg border bg-card p-5 shadow-card">
                <p className="font-mono text-xs text-muted-foreground">webhook: quote.accepted</p>
                <p className="mt-2 text-sm">Kick off fulfillment as soon as a buyer signs off.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  );
}
