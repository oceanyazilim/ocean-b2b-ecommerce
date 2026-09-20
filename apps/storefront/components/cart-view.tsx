"use client";

import type { CountryProfileDetail, CountryProfileSummary, PaymentMethodSummary } from "@ocean/types";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { useCart } from "@/components/cart-provider";
import { CheckoutAddressForm } from "@/components/checkout-address-form";
import { buildAddressFromAnswers, validateAddressField, type AddressFormValues } from "@/lib/address-schema";
import { api, errorMessage } from "@/lib/client-api";
import { checkoutDictionary } from "@/lib/checkout-i18n";
import { formatMoney } from "@/lib/money";

// Country-specific, localized checkout (spec sections 44/45). The shipping address fields below
// are never a fixed list: they come straight from whichever CountryProfile the buyer picks (the
// same catalog the L2 merchant-onboarding form reads), fetched fresh each time the country
// changes — see fetchCountry(). The checkout chrome around it (labels, headings, errors) is
// translated to whichever storefront language is currently active, switched from the header's
// existing language switcher (L4) and passed down as `locale`.
export function CartView({
  paymentMethods,
  countries,
  locale,
}: {
  paymentMethods: PaymentMethodSummary[];
  countries: CountryProfileSummary[];
  locale: string;
}) {
  const { cart, loading, updateItem, removeItem, refresh } = useCart();
  const router = useRouter();
  const t = checkoutDictionary(locale);

  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState(countries[0]?.countryCode ?? "");
  const [country, setCountry] = useState<CountryProfileDetail | null>(null);
  const [countryLoading, setCountryLoading] = useState(false);
  const [addressValues, setAddressValues] = useState<AddressFormValues>({});
  const [phone, setPhone] = useState("");
  const [shippingRateId, setShippingRateId] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const fetchCountry = useCallback(async (code: string) => {
    if (!code) {
      setCountry(null);
      return;
    }
    setCountryLoading(true);
    try {
      const res = await api<{ data: CountryProfileDetail }>(`/countries/${code}`);
      setCountry(res.data);
    } catch {
      setCountry(null);
    } finally {
      setCountryLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCountry(countryCode);
    // Switching country clears answers keyed to the previous country's schema (e.g. TR's
    // "district" has no equivalent once you switch to DE) — same rule L2's business-profile form
    // uses when the merchant changes country.
    setAddressValues({});
    setFieldErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryCode]);

  if (loading) return <p className="px-6 py-10 text-sm text-muted-foreground">{t.loadingCart}</p>;
  if (!cart || cart.items.length === 0) {
    return <p className="px-6 py-10 text-sm text-muted-foreground">{t.emptyCart}</p>;
  }

  async function onCheckout(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const messages = { required: t.requiredField, invalid: t.invalidField };
    const errors: Record<string, string> = {};
    if (country) {
      for (const field of country.addressSchema) {
        const message = validateAddressField(field, addressValues[field.key], messages);
        if (message) errors[field.key] = message;
      }
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const shippingAddress = country
        ? buildAddressFromAnswers(country.addressSchema, addressValues, countryCode, { phone })
        : null;
      const res = await api<{ data: { orderId: string } }>("/cart/checkout", {
        body: {
          email,
          shippingAddress,
          shippingRateId: shippingRateId || null,
          paymentMethodId: paymentMethodId || null,
        },
        headers: { "Idempotency-Key": idempotencyKey },
      });
      router.push(`/checkout/confirmation?order=${res.data.orderId}`);
    } catch (err) {
      setError(errorMessage(err) || t.genericError);
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
              {t.remove}
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-6">
        <dl className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t.subtotal}</dt>
            <dd className="tabular-nums">{formatMoney(cart.totals.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t.shipping}</dt>
            <dd className="tabular-nums">{formatMoney(cart.totals.shippingTotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t.tax}</dt>
            <dd className="tabular-nums">{formatMoney(cart.totals.taxTotal)}</dd>
          </div>
          <div className="flex justify-between border-t pt-1.5 font-semibold">
            <dt>{t.total}</dt>
            <dd className="tabular-nums">{formatMoney(cart.totals.total)}</dd>
          </div>
        </dl>

        <form onSubmit={(e) => void onCheckout(e)} className="flex flex-col gap-6 border-t pt-6" noValidate>
          <h2 className="text-sm font-semibold">{t.orderSummaryHeading}</h2>
          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">{t.contactHeading}</h3>
            <input
              type="email"
              required
              placeholder={t.email}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">{t.deliveryHeading}</h3>
            <select
              aria-label={t.country}
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">{t.selectCountry}</option>
              {countries.map((c) => (
                <option key={c.countryCode} value={c.countryCode}>
                  {c.name}
                </option>
              ))}
            </select>
            {countryLoading && <p className="text-xs text-muted-foreground">…</p>}
            {country && (
              <CheckoutAddressForm
                fields={country.addressSchema}
                values={addressValues}
                onChange={setAddressValues}
                errors={fieldErrors}
              />
            )}
            <input
              type="tel"
              placeholder={t.phone}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>

          {cart.availableShippingRates.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">{t.shippingRate}</h3>
              <select
                value={shippingRateId}
                onChange={(e) => setShippingRateId(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">{t.chooseShippingRate}</option>
                {cart.availableShippingRates.map((rate) => (
                  <option key={rate.id} value={rate.id}>
                    {rate.name} — {formatMoney(rate.price)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {paymentMethods.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">{t.paymentHeading}</h3>
              <select
                value={paymentMethodId}
                onChange={(e) => setPaymentMethodId(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">{t.choosePaymentMethod}</option>
                {paymentMethods.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 inline-flex h-10 items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? t.placingOrder : t.placeOrder}
          </button>
          <button type="button" onClick={() => void refresh()} className="text-xs text-muted-foreground underline">
            {t.refreshCart}
          </button>
        </form>
      </div>
    </div>
  );
}
