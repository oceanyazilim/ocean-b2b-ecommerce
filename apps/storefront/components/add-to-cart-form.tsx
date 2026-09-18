"use client";

import type { StorefrontVariantSummary } from "@ocean/types";
import { useState, type FormEvent } from "react";

import { formatMoney } from "@/lib/money";

import { useCart } from "./cart-provider";

export function AddToCartForm({ variants }: { variants: StorefrontVariantSummary[] }) {
  const { addItem } = useCart();
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState<"idle" | "pending" | "done" | "error">("idle");
  const selected = variants.find((v) => v.id === variantId) ?? variants[0];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setStatus("pending");
    try {
      await addItem(selected.id, quantity);
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  if (variants.length === 0) return <p className="text-sm text-muted-foreground">This product isn&apos;t available.</p>;

  const soldOut = selected && selected.available !== null && selected.available <= 0;

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
      {variants.length > 1 && (
        <select
          value={variantId}
          onChange={(e) => {
            setVariantId(e.target.value);
            setStatus("idle");
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          {variants.map((v) => (
            <option key={v.id} value={v.id} disabled={v.available !== null && v.available <= 0}>
              {v.title} — {formatMoney(v.price)}
              {v.available !== null && v.available <= 0 ? " (sold out)" : ""}
            </option>
          ))}
        </select>
      )}
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
          className="h-9 w-20 rounded-md border border-input bg-background px-3 text-sm"
        />
        <button
          type="submit"
          disabled={status === "pending" || soldOut}
          className="inline-flex h-9 flex-1 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {soldOut ? "Sold out" : status === "pending" ? "Adding…" : status === "done" ? "Added ✓" : "Add to cart"}
        </button>
      </div>
      {status === "error" && <p className="text-sm text-destructive">Couldn&apos;t add that to your cart.</p>}
    </form>
  );
}
