import { Button } from "@ocean/ui";
import type { Metadata } from "next";
import Link from "next/link";

import { CtaBand } from "@/components/cta-band";
import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = {
  title: "Partners",
  description:
    "Build storefronts and integrations for B2B and wholesale merchants as an Ocean Commerce implementation or technology partner.",
};

const tracks = [
  {
    title: "Implementation partners",
    body: "Agencies and consultants who set up company accounts, price lists, and theme storefronts for merchants moving onto Ocean Commerce. You bring the client relationship and B2B commerce expertise; we bring the platform.",
  },
  {
    title: "Technology partners",
    body: "Build against the developer platform — OAuth apps, API keys, webhooks, and theme app blocks — to connect ERPs, fulfillment, or vertical-specific tooling merchants already use.",
  },
];

export default function PartnersPage() {
  return (
    <>
      <PageHero
        eyebrow="Partners"
        title="Build B2B storefronts with us"
        description="We're building out a formal partner program for agencies and technology vendors working with B2B and wholesale merchants."
      >
        <Link href="mailto:partners@oceancommerce.example">
          <Button size="lg">Get in touch</Button>
        </Link>
      </PageHero>

      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid gap-6 sm:grid-cols-2">
          {tracks.map((track) => (
            <div key={track.title} className="rounded-lg border bg-card p-6 shadow-card">
              <h2 className="text-lg font-semibold">{track.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{track.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-10 text-sm text-muted-foreground">
          The partner program is early — reach out and we'll work through fit, resources, and
          revenue share directly rather than through a self-serve application yet.
        </p>
      </section>

      <CtaBand
        title="Already working with a B2B merchant?"
        description="Tell us about the project and we'll get you set up with a partner account."
      />
    </>
  );
}
