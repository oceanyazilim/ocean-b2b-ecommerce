"use client";

import { CartIcon } from "@ocean/ui";
import Link from "next/link";

import { useCart } from "./cart-provider";

export function CartLink() {
  const { cart } = useCart();
  const count = cart?.totals.itemCount ?? 0;
  return (
    <Link
      href="/cart"
      aria-label={`Cart${count > 0 ? `, ${count} items` : ""}`}
      className="relative flex h-9 w-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent"
    >
      <CartIcon size={19} />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
