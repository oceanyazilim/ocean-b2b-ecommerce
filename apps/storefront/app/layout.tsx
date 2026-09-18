import type { Metadata } from "next";
import { headers } from "next/headers";
import type { CSSProperties, ReactNode } from "react";

import { CartProvider } from "@/components/cart-provider";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { hexToHslTriplet } from "@/lib/color";
import { getTheme, listMenus, THEME_PREVIEW_HEADER } from "@/lib/storefront";

import "./globals.css";

export const metadata: Metadata = {
  title: "Storefront",
  description: "Ocean Commerce storefront runtime.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "";
  const storeName = host.split(".")[0] || "Store";
  const isPreview = !!requestHeaders.get(THEME_PREVIEW_HEADER);
  const [theme, menus] = await Promise.all([
    getTheme().catch(() => null),
    listMenus().catch(() => []),
  ]);
  const globalSettings = theme?.globalSettings ?? {};
  const primaryColor = typeof globalSettings.primaryColor === "string" ? globalSettings.primaryColor : undefined;
  const secondaryColor = typeof globalSettings.secondaryColor === "string" ? globalSettings.secondaryColor : undefined;
  const logoUrl = typeof globalSettings.logoUrl === "string" ? globalSettings.logoUrl : null;

  const themeVars: CSSProperties & Record<string, string> = {};
  const primaryHsl = primaryColor ? hexToHslTriplet(primaryColor) : null;
  const secondaryHsl = secondaryColor ? hexToHslTriplet(secondaryColor) : null;
  if (primaryHsl) {
    themeVars["--primary"] = primaryHsl;
    const lightness = Number(primaryHsl.split(" ")[2]?.replace("%", ""));
    themeVars["--primary-foreground"] = lightness > 60 ? "0 0% 0%" : "0 0% 100%";
  }
  if (secondaryHsl) themeVars["--secondary"] = secondaryHsl;

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-background text-foreground" style={themeVars}>
        {isPreview && (
          <div className="bg-amber-400 px-4 py-1.5 text-center text-xs font-medium text-amber-950">
            Theme preview — this draft isn&apos;t published yet
          </div>
        )}
        <CartProvider>
          <Header logoUrl={logoUrl} storeName={storeName} menus={menus} />
          <main className="flex-1">{children}</main>
          <Footer storeName={storeName} />
        </CartProvider>
      </body>
    </html>
  );
}
