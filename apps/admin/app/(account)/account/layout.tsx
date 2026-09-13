import Link from "next/link";
import type { ReactNode } from "react";

import { LogoutButton } from "@/components/logout-button";
import { SidebarNav } from "@/components/sidebar-nav";
import { requireMe } from "@/lib/session";

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const me = await requireMe("/account/security");
  return (
    <div className="min-h-screen bg-muted/40">
      <header className="flex items-center justify-between border-b bg-background px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-block h-6 w-6 rounded-md bg-primary" aria-hidden />
          <Link href="/" className="text-sm font-semibold tracking-tight">
            Ocean Commerce
          </Link>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="hidden sm:inline">{me.user.email}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 lg:flex-row">
        <div className="lg:w-48">
          <h1 className="mb-3 px-3 text-lg font-semibold tracking-tight">Account</h1>
          <SidebarNav
            items={[
              { label: "Security", href: "/account/security" },
              { label: "Back to stores", href: "/" },
            ]}
          />
        </div>
        <div className="min-w-0 flex-1">{children}</div>
      </main>
    </div>
  );
}
