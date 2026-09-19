import { Alert } from "@ocean/ui";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Ocean Commerce privacy policy template.",
};

const sections = [
  {
    title: "1. Overview",
    body: "This Privacy Policy describes how Ocean Commerce (\"we\", \"us\") collects, uses, and shares information when organizations and their staff (\"merchants\") use our platform, and when merchants' customers interact with storefronts built on it.",
  },
  {
    title: "2. Information we collect",
    body: "Account information you provide when you sign up (name, email, organization and store details); usage data such as pages visited and features used within the admin; and, for storefronts, order and customer information that merchants collect from their own buyers to fulfill transactions.",
  },
  {
    title: "3. How we use information",
    body: "To provide and operate the platform, process orders and payments on behalf of merchants, secure accounts, communicate service and billing updates, and improve the product. We do not sell personal information.",
  },
  {
    title: "4. Data controller vs. processor",
    body: "For account and billing data, Ocean Commerce acts as the data controller. For storefront customer data (orders, buyer accounts, company records) collected by a merchant's store, Ocean Commerce acts as a data processor on the merchant's behalf, and the merchant is the controller.",
  },
  {
    title: "5. Sharing and third parties",
    body: "We share information with subprocessors that help us operate the platform (hosting, email delivery, payment processing) under contractual confidentiality and data protection obligations, and as required by law.",
  },
  {
    title: "6. Data retention",
    body: "We retain account and store data for as long as an organization maintains an active subscription, plus a reasonable period after cancellation for backups and legal compliance, after which it is deleted or anonymized.",
  },
  {
    title: "7. Your rights",
    body: "Depending on your jurisdiction, you may have the right to access, correct, export, or delete your personal information. Merchants' end customers should contact the merchant directly; merchants can reach us through account support.",
  },
  {
    title: "8. Security",
    body: "We use industry-standard technical and organizational measures — encryption in transit, role-based access controls, and audit logging — to protect information, but no system is completely secure.",
  },
  {
    title: "9. International transfers",
    body: "Information may be processed in countries other than your own. Where required, we rely on appropriate safeguards for cross-border transfers.",
  },
  {
    title: "10. Changes to this policy",
    body: "We may update this policy from time to time. Material changes will be communicated to organization owners in advance of taking effect.",
  },
  {
    title: "11. Contact",
    body: "Questions about this policy can be directed to your organization's account contact through the admin support channel.",
  },
];

export default function PrivacyPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Legal</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-3 text-sm text-muted-foreground">Last updated: September 19, 2026</p>

      <Alert className="mt-8" variant="warning">
        This is a template placeholder, not legal advice. Before publishing, have this reviewed
        by counsel and adapted to your organization's actual data practices and applicable law.
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
