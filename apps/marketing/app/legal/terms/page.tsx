import { Alert } from "@ocean/ui";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Ocean Commerce terms of service template.",
};

const sections = [
  {
    title: "1. Agreement to terms",
    body: "These Terms of Service (\"Terms\") govern access to and use of the Ocean Commerce platform, including the admin, storefront runtime, APIs, and any associated services (the \"Service\"). By creating an organization or using the Service, you agree to these Terms on behalf of yourself and, if applicable, your organization.",
  },
  {
    title: "2. Accounts and organizations",
    body: "An organization may contain one or more stores. The organization owner is responsible for staff access, billing, and compliance with these Terms across every store in the organization. You must provide accurate information when creating an account and keep credentials confidential.",
  },
  {
    title: "3. Plans and billing",
    body: "The Service is offered on Starter, Growth, and Enterprise plans as described on our pricing page. Paid plans are billed monthly or annually in advance. Fees are non-refundable except where required by law. We may change plan pricing with advance notice to active subscribers.",
  },
  {
    title: "4. Acceptable use",
    body: "You may not use the Service to sell illegal goods, infringe intellectual property, process fraudulent transactions, or attempt to circumvent plan limits, security controls, or API rate limits. We may suspend accounts that violate this section.",
  },
  {
    title: "5. Merchant responsibility for storefront content",
    body: "You are solely responsible for the products, pricing, content, and customer data on your store. Ocean Commerce does not review storefront content before publication and is not a party to transactions between you and your customers.",
  },
  {
    title: "6. API and developer platform",
    body: "Use of OAuth apps, API keys, and webhooks is subject to the scopes you are granted. You may not use the API to circumvent plan limits or extract data in violation of applicable privacy law. We may revoke API access that we reasonably believe threatens platform security or stability.",
  },
  {
    title: "7. Intellectual property",
    body: "Ocean Commerce retains all rights to the platform, including its software, design system, and documentation. You retain all rights to your store's content, product data, and customer data.",
  },
  {
    title: "8. Service availability",
    body: "We aim for high availability but do not guarantee uninterrupted access. Planned maintenance and incident status are posted on our status page.",
  },
  {
    title: "9. Termination",
    body: "You may cancel your subscription at any time; access continues through the end of the current billing period. We may suspend or terminate accounts for material breach of these Terms, including non-payment, after reasonable notice where practical.",
  },
  {
    title: "10. Limitation of liability",
    body: "To the maximum extent permitted by law, Ocean Commerce is not liable for indirect, incidental, or consequential damages arising from use of the Service. Our aggregate liability is limited to the fees paid in the twelve months preceding the claim.",
  },
  {
    title: "11. Changes to these terms",
    body: "We may update these Terms from time to time. Material changes will be communicated to organization owners in advance of taking effect. Continued use after changes take effect constitutes acceptance.",
  },
  {
    title: "12. Contact",
    body: "Questions about these Terms can be directed to your organization's account contact through the admin support channel.",
  },
];

export default function TermsPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Legal</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="mt-3 text-sm text-muted-foreground">Last updated: September 19, 2026</p>

      <Alert className="mt-8" variant="warning">
        This is a template placeholder, not legal advice. Before publishing, have this reviewed
        by counsel and adapted to your jurisdiction, pricing, and actual service terms.
      </Alert>

      <div className="mt-10 flex flex-col gap-8">
        {sections.map((section) => (
          <div key={section.title}>
            <h2 className="text-lg font-semibold">{section.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{section.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
