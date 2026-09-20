import type { MenuSummary, StorefrontLanguageSummary } from "@ocean/types";
import { UserIcon } from "@ocean/ui";
import Link from "next/link";

import { CartLink } from "./cart-link";
import { LanguageSwitcher } from "./language-switcher";
import { NavMenu } from "./nav-menu";
import { SearchBox } from "./search-box";

export function Header({
  logoUrl,
  storeName,
  menus,
  languages,
  activeLocale,
}: {
  logoUrl: string | null;
  storeName: string;
  menus: MenuSummary[];
  languages: StorefrontLanguageSummary[];
  activeLocale: string;
}) {
  const nav = menus.find((m) => m.handle === "main-menu") ?? menus[0] ?? null;

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={storeName} className="h-8 w-auto" />
          ) : (
            <span className="text-lg font-semibold tracking-tight">{storeName}</span>
          )}
        </Link>
        <nav className="flex flex-wrap items-center gap-6 text-sm font-medium">
          <Link href="/collections" className="text-foreground/80 transition-colors hover:text-foreground">
            Shop
          </Link>
          {nav && <NavMenu items={nav.items ?? []} />}
        </nav>
        <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1 sm:px-4">
          <SearchBox />
        </div>
        <div className="flex items-center gap-1">
          <LanguageSwitcher languages={languages} activeLocale={activeLocale} />
          <Link
            href="/account"
            aria-label="Account"
            className="flex h-9 w-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent"
          >
            <UserIcon size={19} />
          </Link>
          <CartLink />
        </div>
      </div>
    </header>
  );
}
