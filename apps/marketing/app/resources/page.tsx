import type { Metadata } from "next";
import Link from "next/link";

import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = {
  title: "Resources",
  description: "Guides, documentation, and reference material for running a store on Ocean Commerce.",
};

const links = [
  { href: "/features", title: "Feature overview", body: "A full tour of catalog, pricing, quotes, inventory, and the store builder." },
  { href: "/b2b", title: "B2B commerce guide", body: "How company accounts, pricing, credit, and approvals fit together." },
  { href: "/wholesale", title: "Wholesale guide", body: "Volume pricing, draft orders, and multi-location inventory for distributors." },
  { href: "/themes", title: "Store builder guide", body: "How to assemble, preview, and publish a storefront theme." },
  { href: "/developers", title: "Developer platform", body: "OAuth apps, API keys, webhooks, and scopes." },
  { href: "/help", title: "Help center", body: "Answers to common setup and account questions." },
];

export default function ResourcesPage() {
  return (
    <>
      <PageHero
        eyebrow="Resources"
        title="Guides for setting up and running your store"
        description="We're building out a full resource library. In the meantime, these pages cover the platform's core capabilities in depth."
      />

      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg border bg-card p-6 shadow-card transition-colors hover:bg-accent"
            >
              <h2 className="font-semibold">{link.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{link.body}</p>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
