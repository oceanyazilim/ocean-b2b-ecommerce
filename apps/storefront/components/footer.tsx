import Link from "next/link";

import { listPages } from "@/lib/storefront";

// L6 Global Localization (spec section 46): "Surface these correctly on the storefront (footer
// legal links)" — real published Pages tagged with a legalRequirementCode (Impressum,
// Datenschutz, Mesafeli Satış Sözleşmesi, whatever this store's active markets actually need),
// never a hardcoded list of link labels.
export async function Footer({ storeName }: { storeName: string }) {
  const pages = await listPages().catch(() => []);
  const legalPages = pages.filter((p) => p.legalRequirementCode);

  return (
    <footer className="border-t bg-canvas">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-start sm:justify-between">
        <span className="text-sm font-semibold tracking-tight">{storeName}</span>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <Link href="/collections" className="hover:text-foreground">
            Shop
          </Link>
          <Link href="/account" className="hover:text-foreground">
            Account
          </Link>
        </nav>
        {legalPages.length > 0 && (
          <nav aria-label="Legal" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {legalPages.map((page) => (
              <Link key={page.id} href={`/pages/${page.handle}`} className="hover:text-foreground">
                {page.title}
              </Link>
            ))}
          </nav>
        )}
        <span className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} {storeName}. All rights reserved.
        </span>
      </div>
    </footer>
  );
}
