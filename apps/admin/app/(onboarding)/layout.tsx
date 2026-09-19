import { Alert } from "@ocean/ui";
import Link from "next/link";
import type { ReactNode } from "react";

import { requireMe } from "@/lib/session";

import { LogoutButton } from "@/components/logout-button";

export default async function OnboardingLayout({ children }: { children: ReactNode }) {
  const me = await requireMe();
  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex items-center justify-between border-b bg-background px-6 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            O
          </span>
          <span className="text-sm font-semibold tracking-tight">Ocean Commerce</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="hidden sm:inline">{me.user.email}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10">
        {!me.user.emailVerified && (
          <Alert variant="warning" title="Verify your email to continue">
            We sent a link to {me.user.email}. Creating an organization requires a verified address.{" "}
            <Link href="/verify-email" className="underline">
              Need a new link?
            </Link>
          </Alert>
        )}
        {children}
      </main>
    </div>
  );
}
