import type { StorefrontCustomer } from "@ocean/types";
import Link from "next/link";

import { LogoutButton } from "@/components/logout-button";
import { storefrontFetch } from "@/lib/api";
import { getContext } from "@/lib/storefront";

export default async function AccountPage() {
  const context = await getContext();

  if (!context.signedIn) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center gap-4 px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Your account</h1>
        <p className="text-muted-foreground">Sign in to see your orders and details.</p>
        <div className="flex gap-3">
          <Link href="/account/login" className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
            Sign in
          </Link>
          <Link href="/account/signup" className="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium hover:bg-muted">
            Create account
          </Link>
        </div>
      </div>
    );
  }

  const customer = await storefrontFetch<{ data: StorefrontCustomer }>("/auth/me").then((r) => r.data);

  return (
    <div className="mx-auto flex max-w-sm flex-col items-start gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Your account</h1>
      <div className="text-sm">
        <p className="font-medium">{customer.displayName}</p>
        <p className="text-muted-foreground">{customer.email}</p>
        {customer.company && <p className="text-muted-foreground">{customer.company.displayName}</p>}
      </div>
      <LogoutButton />
    </div>
  );
}
