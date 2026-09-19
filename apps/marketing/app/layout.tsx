import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Ocean Commerce — B2B & Wholesale Commerce Platform",
    template: "%s | Ocean Commerce",
  },
  description:
    "Ocean Commerce is a multi-tenant commerce platform built for B2B and wholesale: company accounts, customer-specific pricing, quotes, credit limits, order approvals, and a live storefront theme editor.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-background text-foreground">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
