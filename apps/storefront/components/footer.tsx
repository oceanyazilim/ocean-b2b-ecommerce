import Link from "next/link";

export function Footer({ storeName }: { storeName: string }) {
  return (
    <footer className="border-t bg-canvas">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm font-semibold tracking-tight">{storeName}</span>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <Link href="/collections" className="hover:text-foreground">
            Shop
          </Link>
          <Link href="/account" className="hover:text-foreground">
            Account
          </Link>
        </nav>
        <span className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} {storeName}. All rights reserved.
        </span>
      </div>
    </footer>
  );
}
