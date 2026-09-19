import { Badge, Button, CheckIcon } from "@ocean/ui";
import type { Metadata } from "next";
import Link from "next/link";

import { CtaBand } from "@/components/cta-band";
import { ADMIN_URL } from "@/components/nav-links";
import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = {
  title: "Developer Platform",
  description:
    "OAuth apps, scoped API keys, and webhooks for Ocean Commerce — build integrations and apps against products, orders, pricing, and themes.",
};

const scopes = [
  "products.read",
  "products.write",
  "orders.read",
  "orders.write",
  "customers.read",
  "pricing.read",
  "quotes.read",
  "themes.edit",
];

const webhookTopics = [
  { topic: "order.created", body: "Fires the moment a new order lands, draft or storefront." },
  { topic: "quote.accepted", body: "Fires when a buyer or staff member accepts a quote." },
  { topic: "return.requested", body: "Fires when a customer opens a return." },
  { topic: "product.updated", body: "Fires when a product or its variants change." },
];

const capabilities = [
  {
    title: "OAuth apps",
    body: "Register an app with a name and a set of scopes. Merchants install it and grant exactly the access it asks for — nothing more.",
  },
  {
    title: "Scoped API keys",
    body: "For direct integrations that don't need a full OAuth flow, issue an API key scoped to only the resources it needs, and revoke it instantly when you're done.",
  },
  {
    title: "Webhooks",
    body: "Subscribe to the events that matter to your integration and get a push notification instead of polling. Revoke a webhook and it stops immediately.",
  },
  {
    title: "App blocks",
    body: "Ship theme-injectable blocks so merchants can drop your app's UI directly into a storefront section from the theme editor.",
  },
];

export default function DevelopersPage() {
  return (
    <>
      <PageHero
        eyebrow="Developer platform"
        title="Build against the same API the product runs on"
        description="OAuth apps, scoped API keys, and webhooks for the commerce data that matters — products, orders, pricing, quotes, and themes."
      >
        <Link href={`${ADMIN_URL}/signup`}>
          <Button size="lg">Start building</Button>
        </Link>
      </PageHero>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-6 sm:grid-cols-2">
          {capabilities.map((item) => (
            <div key={item.title} className="rounded-lg border bg-card p-6 shadow-card">
              <h2 className="text-lg font-semibold">{item.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t bg-canvas">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Scoped access, by design</h2>
              <p className="mt-3 text-muted-foreground">
                Every app and API key is granted a specific list of scopes at creation time.
                Revoking an app also revokes every key it issued.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {scopes.map((scope) => (
                  <Badge key={scope} variant="secondary" className="font-mono">
                    {scope}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Webhook topics</h2>
              <p className="mt-3 text-muted-foreground">
                Subscribe by topic and we'll push a payload to your endpoint as events happen.
              </p>
              <div className="mt-6 flex flex-col gap-3">
                {webhookTopics.map((hook) => (
                  <div key={hook.topic} className="rounded-lg border bg-card p-4 shadow-card">
                    <p className="font-mono text-sm">{hook.topic}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{hook.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-20">
        <h2 className="text-2xl font-semibold tracking-tight">From the settings → developer tab</h2>
        <p className="mt-3 text-muted-foreground">
          Every store has a developer settings page where staff can manage apps, API keys, and
          webhooks without leaving the admin.
        </p>
        <ul className="mt-6 flex flex-col gap-4">
          {[
            "Create an OAuth app, assign it scopes, and share the client credentials with your integration.",
            "Issue a scoped API key for a direct server-to-server integration and copy the secret once — it's never shown again.",
            "Add a webhook subscription by topic and endpoint URL, and see its delivery status.",
            "Revoke any app, key, or webhook instantly from the same screen.",
          ].map((item) => (
            <li key={item} className="flex items-start gap-3">
              <CheckIcon size={18} className="mt-0.5 shrink-0 text-success" />
              <span className="text-foreground/90">{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <CtaBand
        title="Start building on Ocean Commerce"
        description="Create a store, open Settings → Developer, and register your first app or webhook."
      />
    </>
  );
}
