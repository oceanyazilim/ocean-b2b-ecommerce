import type { Metadata } from "next";
import Link from "next/link";

import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = {
  title: "Help Center",
  description: "Answers to common questions about setting up companies, pricing, orders, and stores on Ocean Commerce.",
};

const categories = [
  {
    title: "Getting started",
    questions: [
      "How do I create my first store?",
      "How do I invite staff and set their roles?",
      "How do I move from Starter to Growth?",
    ],
  },
  {
    title: "Companies & B2B pricing",
    questions: [
      "How do I create a company account and add locations?",
      "How do I assign a price list to a company?",
      "How do I set a credit limit and payment terms?",
      "How do order approvals work?",
    ],
  },
  {
    title: "Catalog & inventory",
    questions: [
      "How do I add product variants?",
      "How do I scope a catalog to a specific company?",
      "How do I transfer inventory between locations?",
    ],
  },
  {
    title: "Store builder",
    questions: [
      "How do I edit my storefront theme?",
      "How do I connect a custom domain?",
      "How do I preview changes before publishing?",
    ],
  },
  {
    title: "Billing",
    questions: [
      "What happens if I hit a plan limit?",
      "How do I upgrade or downgrade my plan?",
      "Where can I see my invoices?",
    ],
  },
  {
    title: "Developer platform",
    questions: [
      "How do I create an API key?",
      "How do I subscribe to a webhook?",
      "How do I revoke an app's access?",
    ],
  },
];

export default function HelpPage() {
  return (
    <>
      <PageHero
        eyebrow="Help center"
        title="Answers to common questions"
        description="A starting map of the topics our help center covers. For anything not listed here, reach out through your admin support channel."
      />
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <div key={category.title} className="rounded-lg border bg-card p-6 shadow-card">
              <h2 className="font-semibold">{category.title}</h2>
              <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
                {category.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-10 text-center text-sm text-muted-foreground">
          Looking for something specific?{" "}
          <Link href="/resources" className="font-medium underline">
            Browse resources
          </Link>{" "}
          or check our{" "}
          <Link href="/status" className="font-medium underline">
            system status
          </Link>
          .
        </p>
      </section>
    </>
  );
}
