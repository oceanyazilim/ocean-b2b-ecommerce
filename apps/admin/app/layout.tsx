import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Ocean Admin",
  description: "Merchant administration for Ocean Commerce.",
};

// Provides the admin-panel language (Türkçe / English — see lib/locale.ts) to every route via
// next-intl. This is the *admin chrome's* language only; it's read from a small first-party
// cookie, not from anything storefront-related. Only the app shell (sidebar/header/command
// palette) and the Dashboard/Home page currently call useTranslations — every other page still
// renders its literal English strings unchanged regardless of this locale, which is expected for
// this pass (see the i18n phase report for the exact boundary).
export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale}>
      <body className="min-h-screen bg-background text-foreground">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
