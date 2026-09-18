"use client";

import type { PaymentMethodSummary } from "@ocean/types";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { useCart } from "@/components/cart-provider";
import { api, errorMessage } from "@/lib/client-api";
import { formatMoney } from "@/lib/money";

export function CartView({ paymentMethods }: { paymentMethods: PaymentMethodSummary[] }) {
  const { cart, loading, updateItem, removeItem, refresh } = useCart();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [address1, setAddress1] = useState("");
  const [city, setCity] = useState("");
  const [countryCode, setCountryCode] = useState("TR");
  const [shippingRateId, setShippingRateId] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  if (loading) return <p className="px-6 py-10 text-sm text-muted-foreground">Loading your cart…</p>;
  if (!cart || cart.items.length === 0) {
    return <p className="px-6 py-10 text-sm text-muted-foreground">Your cart is empty.</p>;
  }

  async function onCheckout(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ data: { orderId: string } }>("/cart/checkout", {
        body: {
          email,
          shippingAddress: address1 ? { address1, city, countryCode } : null,
          shippingRateId: shippingRateId || null,
          paymentMethodId: paymentMethodId || null,
        },
        headers: { "Idempotency-Key": idempotencyKey },
      });
      router.push(`/checkout/confirmation?order=${res.data.orderId}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-10 px-6 py-10 lg:grid-cols-[2fr_1fr]">
      <div className="flex flex-col divide-y">
        {cart.items.map((item) => (
          <div key={item.id} className="flex items-center gap-4 py-4">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
              {item.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image.url} alt={item.image.alt ?? item.title} className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.title}</p>
              {item.variantTitle !== "Default Title" && (
                <p className="text-xs text-muted-foreground">{item.variantTitle}</p>
              )}
              <p className="text-xs text-muted-foreground">{formatMoney(item.unitPrice)}</p>
            </div>
            <input
              type="number"
              min={1}
              value={item.quantity}
              onChange={(e) => void updateItem(item.id, Math.max(1, Number(e.target.value) || 1))}
              className="h-9 w-16 rounded-md border border-input bg-background px-2 text-sm"
            />
            <p className="w-20 text-right text-sm font-medium">{formatMoney(item.lineTotal)}</p>
            <button
              type="button"
              onClick={() => void removeItem(item.id)}
              className="text-xs text-muted-foreground hover:text-destructive"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-6">
        <dl className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular-nums">{formatMoney(cart.totals.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Shipping</dt>
            <dd className="tabular-nums">{formatMoney(cart.totals.shippingTotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Tax</dt>
            <dd className="tabular-nums">{formatMoney(cart.totals.taxTotal)}</dd>
          </div>
          <div className="flex justify-between border-t pt-1.5 font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatMoney(cart.totals.total)}</dd>
          </div>
        </dl>

        <form onSubmit={(e) => void onCheckout(e)} className="flex flex-col gap-3 border-t pt-6">
          <h2 className="text-sm font-semibold">Checkout</h2>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          />
          <input
            placeholder="Address"
            value={address1}
            onChange={(e) => setAddress1(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          />
          <div className="flex gap-2">
            <input
              placeholder="City"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
            />
            <input
              placeholder="Country"
              maxLength={2}
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
              className="h-9 w-20 rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
          {cart.availableShippingRates.length > 0 && (
            <select
              value={shippingRateId}
              onChange={(e) => setShippingRateId(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Choose a shipping rate</option>
              {cart.availableShippingRates.map((rate) => (
                <option key={rate.id} value={rate.id}>
                  {rate.name} — {formatMoney(rate.price)}
                </option>
              ))}
            </select>
          )}
          {paymentMethods.length > 0 && (
            <select
              value={paymentMethodId}
              onChange={(e) => setPaymentMethodId(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Choose a payment method</option>
              {paymentMethods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="mt-2 inline-flex h-10 items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Placing order…" : "Place order"}
          </button>
          <button type="button" onClick={() => void refresh()} className="text-xs text-muted-foreground underline">
            Refresh cart
          </button>
        </form>
      </div>
    </div>
  );
}
