import type { MenuSummary } from "@ocean/types";
import Link from "next/link";

import { CartLink } from "./cart-link";

export function Header({
  logoUrl,
  storeName,
  menus,
}: {
  logoUrl: string | null;
  storeName: string;
  menus: MenuSummary[];
}) {
  const nav = menus.find((m) => m.handle === "main-menu") ?? menus[0] ?? null;

  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={storeName} className="h-8 w-auto" />
          ) : (
            <span className="text-lg font-semibold tracking-tight">{storeName}</span>
          )}
        </Link>
        {nav && nav.items && nav.items.length > 0 && (
          <nav className="flex flex-wrap gap-5 text-sm">
            {nav.items.map((item) => (
              <Link key={item.id} href={item.url ?? "#"} className="text-muted-foreground hover:text-foreground">
                {item.label}
              </Link>
            ))}
          </nav>
        )}
        <div className="flex items-center gap-4 text-sm">
          <Link href="/collections" className="text-muted-foreground hover:text-foreground">
            Shop
          </Link>
          <Link href="/account" className="text-muted-foreground hover:text-foreground">
            Account
          </Link>
          <CartLink />
        </div>
      </div>
    </header>
  );
}
