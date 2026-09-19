import Link from "next/link";

import { footerColumns } from "./nav-links";

export function SiteFooter() {
  return (
    <footer className="border-t bg-canvas">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
          <div className="col-span-2 flex flex-col gap-3 sm:col-span-3 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2 text-base font-semibold tracking-tight">
              <span
                aria-hidden
                className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground"
              >
                O
              </span>
              Ocean Commerce
            </Link>
            <p className="max-w-xs text-sm text-muted-foreground">
              Multi-tenant commerce infrastructure built for B2B and wholesale: company accounts,
              custom pricing, quotes, and a real storefront theme editor.
            </p>
          </div>
          {footerColumns.map((column) => (
            <div key={column.title} className="flex flex-col gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {column.title}
              </span>
              <nav className="flex flex-col gap-2 text-sm">
                {column.links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="text-foreground/80 transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Ocean Commerce. All rights reserved.</span>
          <span>Built for B2B, wholesale, and DTC commerce on one platform.</span>
        </div>
      </div>
    </footer>
  );
}
