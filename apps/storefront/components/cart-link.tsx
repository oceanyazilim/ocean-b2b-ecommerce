"use client";

import Link from "next/link";

import { useCart } from "./cart-provider";

export function CartLink() {
  const { cart } = useCart();
  const count = cart?.totals.itemCount ?? 0;
  return (
    <Link href="/cart" className="font-medium hover:underline">
      Cart{count > 0 ? ` (${count})` : ""}
    </Link>
  );
}
