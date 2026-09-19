import { Badge, CheckIcon } from "@ocean/ui";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "System Status",
  description: "Current operational status of Ocean Commerce services.",
};

const services = [
  "Admin",
  "Storefront rendering",
  "Checkout & payments",
  "Public API",
  "Webhooks",
  "Theme editor & preview",
];

export default function StatusPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-16">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            System status
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">All systems operational</h1>
        </div>
        <Badge variant="success" className="whitespace-nowrap">
          Operational
        </Badge>
      </div>
      <p className="mt-4 text-muted-foreground">
        This page is a template for status reporting. Once connected to real uptime monitoring,
        it will reflect live incident and maintenance history for each service below.
      </p>

      <div className="mt-10 flex flex-col divide-y rounded-lg border bg-card shadow-card">
        {services.map((service) => (
          <div key={service} className="flex items-center justify-between px-5 py-4">
            <span className="text-sm font-medium">{service}</span>
            <span className="flex items-center gap-1.5 text-sm text-success">
              <CheckIcon size={16} />
              Operational
            </span>
          </div>
        ))}
      </div>

      <div className="mt-10">
        <h2 className="text-lg font-semibold">Incident history</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          No incidents reported. Past incidents and scheduled maintenance windows will be listed
          here once this page is wired up to our monitoring provider.
        </p>
      </div>
    </section>
  );
}
