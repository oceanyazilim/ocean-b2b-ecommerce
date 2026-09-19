import { Button, CheckIcon } from "@ocean/ui";
import type { Metadata } from "next";
import Link from "next/link";

import { CtaBand } from "@/components/cta-band";
import { ADMIN_URL } from "@/components/nav-links";
import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = {
  title: "Themes & Store Builder",
  description:
    "A section-based storefront theme editor with live preview, per-store branding, and custom domains — build a store without writing code.",
};

const sections = [
  { name: "Hero", body: "A full-width banner with heading, copy, background image, and a call to action." },
  { name: "Featured products", body: "Pull a hand-picked or collection-based grid of products onto any page." },
  { name: "Image with text", body: "Pair an image with a headline and copy — for stories, categories, or promotions." },
  { name: "Rich text", body: "Freeform formatted copy for anything that doesn't need a dedicated block." },
];

const steps = [
  { title: "Pick a theme", body: "Start from a theme and duplicate it to experiment without touching what's live." },
  { title: "Arrange sections", body: "Add, reorder, and configure sections on each page — no template code required." },
  { title: "Set global branding", body: "Set your store's primary and secondary colors and logo once; they apply across the whole storefront." },
  { title: "Preview live", body: "See exactly what a customer would see before anything goes public, on the real storefront rendering." },
  { title: "Publish", body: "Push the draft live. Previous published versions stay available if you need to roll back." },
  { title: "Connect a domain", body: "Point your own domain at the store from Settings → Domains once you're ready." },
];

export default function ThemesPage() {
  return (
    <>
      <PageHero
        eyebrow="Themes & store builder"
        title="A storefront editor built for merchants, not developers"
        description="Assemble pages from sections, preview changes against the real storefront renderer, and publish when you're ready — no theme code required."
      >
        <Link href={`${ADMIN_URL}/signup`}>
          <Button size="lg">Start free</Button>
        </Link>
      </PageHero>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Sections you drop in, not code you write</h2>
            <p className="mt-3 text-muted-foreground">
              Every page is built from sections. Add a hero, drop in featured products, pair an
              image with text, or add rich text — reorder them, and see the result instantly in
              preview.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {sections.map((section) => (
              <div key={section.name} className="rounded-lg border bg-card p-5 shadow-card">
                <h3 className="font-semibold">{section.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{section.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t bg-canvas">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight">From theme to live domain</h2>
            <p className="mt-4 text-muted-foreground">Six steps, all inside the admin.</p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {steps.map((step, index) => (
              <div key={step.title} className="rounded-lg border bg-card p-6 shadow-card">
                <span className="text-xs font-semibold text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-2 font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-20">
        <h2 className="text-2xl font-semibold tracking-tight">What comes with every store</h2>
        <ul className="mt-6 flex flex-col gap-4">
          {[
            "A live preview that renders against the actual storefront app, not a static mockup.",
            "Per-store primary and secondary brand colors that flow through buttons, links, and accents automatically.",
            "Draft and published versions, so in-progress edits never affect what customers see.",
            "Custom domain support so your storefront runs on your own domain, not a shared subdomain.",
            "The same theme runtime whether the store sells DTC, B2B, or both.",
          ].map((item) => (
            <li key={item} className="flex items-start gap-3">
              <CheckIcon size={18} className="mt-0.5 shrink-0 text-success" />
              <span className="text-foreground/90">{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <CtaBand
        title="Design your storefront in an afternoon"
        description="No theme code, no developer ticket — just sections, preview, and publish."
      />
    </>
  );
}
