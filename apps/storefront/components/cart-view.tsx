"use client";

import type { CountryProfileDetail, CountryProfileSummary, PaymentMethodSummary } from "@ocean/types";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { useCart } from "@/components/cart-provider";
import { CheckoutAddressForm } from "@/components/checkout-address-form";
import { buildAddressFromAnswers, validateAddressField, type AddressFormValues } from "@/lib/address-schema";
import { api, errorMessage } from "@/lib/client-api";
import type { CheckoutDictionary } from "@/lib/checkout-i18n";
import { formatMoney } from "@/lib/money";

// `t.requiredFieldTemplate`/`t.invalidFieldTemplate` are plain `{field}`-placeholder strings, not
// functions — see the comment on CheckoutDictionary in lib/checkout-i18n.ts for why (the
// dictionary is built server-side and passed down as a prop, and RSC can't serialize functions
// across that boundary). This interpolates one for a given field label.
function formatFieldMessage(template: string, label: string): string {
  return template.replace("{field}", label);
}

// Country-specific, localized checkout (spec sections 44/45). The shipping address fields below
// are never a fixed list: they come straight from whichever CountryProfile the buyer picks (the
// same catalog the L2 merchant-onboarding form reads), fetched fresh each time the country
// changes — see fetchCountry(). The checkout chrome around it (labels, headings, errors) is
// resolved server-side (lib/checkout-i18n.ts, via the same system-label mechanism the rest of L4
// uses) from whichever storefront language is currently active, and passed down as `dictionary`.
export function CartView({
  paymentMethods,
  countries,
  dictionary: t,
}: {
  paymentMethods: PaymentMethodSummary[];
  countries: CountryProfileSummary[];
  dictionary: CheckoutDictionary;
}) {
  const { cart, loading, updateItem, removeItem, refresh } = useCart();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState(countries[0]?.countryCode ?? "");
  const [country, setCountry] = useState<CountryProfileDetail | null>(null);
  const [countryLoading, setCountryLoading] = useState(false);
  // Finding 1 fix: the country-detail fetch used to swallow any failure into `country = null`
  // with no visible error, and checkout's field-validation loop only ran `if (country)` — so a
  // transient fetch failure, or picking a country the store has no CountryProfile for, meant
  // checkout silently submitted `shippingAddress: null` and completed as a real order with no
  // shipping address. `countryError` now surfaces that failure and `onCheckout` below blocks
  // submission entirely while it's set (or while `country` is otherwise null).
  const [countryError, setCountryError] = useState<string | null>(null);
  const [addressValues, setAddressValues] = useState<AddressFormValues>({});
  const [phone, setPhone] = useState("");
  const [shippingRateId, setShippingRateId] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const fetchCountry = useCallback(
    async (code: string) => {
      if (!code) {
        setCountry(null);
        setCountryError(null);
        return;
      }
      setCountryLoading(true);
      setCountryError(null);
      try {
        const res = await api<{ data: CountryProfileDetail }>(`/countries/${code}`);
        if (!res.data) {
          setCountry(null);
          setCountryError(t.countryUnavailable);
        } else {
          setCountry(res.data);
        }
      } catch {
        setCountry(null);
        setCountryError(t.countryUnavailable);
      } finally {
        setCountryLoading(false);
      }
    },
    [t.countryUnavailable],
  );

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

    // Finding 1 fix: never fall through to submitting `shippingAddress: null`. Without a loaded
    // CountryProfile there is no addressSchema to validate against or build an Address from, so
    // checkout is blocked here with a clear, visible error instead of treating "no country" as
    // "no validation needed".
    if (!country) {
      setError(countryError ?? t.countryUnavailable);
      return;
    }

    const messages = {
      required: (label: string) => formatFieldMessage(t.requiredFieldTemplate, label),
      invalid: (label: string) => formatFieldMessage(t.invalidFieldTemplate, label),
    };
    const errors: Record<string, string> = {};
    for (const field of country.addressSchema) {
      const message = validateAddressField(field, addressValues[field.key], messages);
      if (message) errors[field.key] = message;
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const shippingAddress = buildAddressFromAnswers(country.addressSchema, addressValues, countryCode, { phone });
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
            {!countryLoading && countryError && (
              <div className="flex items-center gap-2 text-xs text-destructive">
                <p>{countryError}</p>
                <button type="button" onClick={() => void fetchCountry(countryCode)} className="underline">
                  {t.retry}
                </button>
              </div>
            )}
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
