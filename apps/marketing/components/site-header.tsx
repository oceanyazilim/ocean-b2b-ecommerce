import { Button, MenuIcon } from "@ocean/ui";
import Link from "next/link";

import { ADMIN_URL, primaryNav } from "./nav-links";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground"
          >
            O
          </span>
          Ocean Commerce
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
          {primaryNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-foreground/80 transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link href={`${ADMIN_URL}/login`} className="hidden sm:block">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
          <Link href={`${ADMIN_URL}/signup`}>
            <Button size="sm">Start free</Button>
          </Link>
          <details className="relative md:hidden">
            <summary
              aria-label="Open menu"
              className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-md text-foreground hover:bg-accent"
            >
              <MenuIcon size={20} />
            </summary>
            <nav className="absolute right-0 top-11 flex w-52 flex-col gap-1 rounded-lg border bg-card p-2 text-sm font-medium shadow-popover">
              {primaryNav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-3 py-2 text-foreground/80 hover:bg-accent hover:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
              <Link
                href={`${ADMIN_URL}/login`}
                className="rounded-md px-3 py-2 text-foreground/80 hover:bg-accent hover:text-foreground"
              >
                Sign in
              </Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
