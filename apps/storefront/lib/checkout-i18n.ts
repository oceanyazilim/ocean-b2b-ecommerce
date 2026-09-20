import "server-only";

import { SYSTEM_LABEL_REGISTRY } from "@ocean/types";

import { storefrontFetch } from "./api";

// Localized checkout (spec section 45): "Checkout language should automatically follow storefront
// language. Translate: Contact, Delivery, Payment, Billing, Order summary, Errors, Validation."
//
// This used to be a hand-written `Record<string, CheckoutDictionary>` covering only en/tr/de —
// unlike the rest of the L4 localization system (StoreLanguage/Translation, GET
// /storefront/v1/system-labels), which is fully data-driven off real store data with no
// hardcoded language list. A merchant who added a 4th storefront language would have gotten
// checkout silently falling back to English while every other page correctly translated. This
// file now reuses that SAME system-label mechanism instead of a second, parallel one: the keys
// below (all prefixed "checkout.") live in @ocean/types' SYSTEM_LABEL_REGISTRY — see
// packages/types/src/localization.ts — get resolved server-side by the existing
// GET /storefront/v1/system-labels?locale=... endpoint (translatable via the same admin
// Translations screen merchants already use for nav/cart/account labels), and are assembled here
// into the same CheckoutDictionary shape the checkout UI already consumes.
//
// Deliberately separate from the per-country address FIELD labels (e.g. TR's "Mahalle"): those
// come from CountryProfile.addressSchema and are already written in that country's own language
// (a Turkish delivery form uses Turkish field names regardless of which language the buyer is
// browsing the rest of the site in) — this dictionary only covers the surrounding checkout copy
// that should follow the buyer's chosen storefront language.

export interface CheckoutDictionary {
  cartTitle: string;
  loadingCart: string;
  emptyCart: string;
  remove: string;
  refreshCart: string;
  subtotal: string;
  shipping: string;
  tax: string;
  total: string;
  contactHeading: string;
  email: string;
  phone: string;
  deliveryHeading: string;
  country: string;
  selectCountry: string;
  shippingRate: string;
  chooseShippingRate: string;
  billingHeading: string;
  billingSameAsDelivery: string;
  paymentHeading: string;
  paymentMethod: string;
  choosePaymentMethod: string;
  orderSummaryHeading: string;
  placeOrder: string;
  placingOrder: string;
  genericError: string;
  retry: string;
  // Finding 1 fix (correctness): shown instead of silently submitting `shippingAddress: null`
  // when the country-detail fetch fails or the selected country has no configured CountryProfile.
  countryUnavailable: string;
  // Raw `{field}`-placeholder templates rather than functions: this whole object crosses the
  // Server -> Client Component boundary as a prop (app/cart/page.tsx -> CartView), and React
  // Server Components cannot serialize functions across that boundary. CartView interpolates
  // these itself — see `formatFieldMessage` in components/cart-view.tsx.
  requiredFieldTemplate: string;
  invalidFieldTemplate: string;
}

// Maps each CheckoutDictionary field to its SYSTEM_LABEL_REGISTRY key. Kept as a single source of
// truth so a key can never be added to one without the other going stale.
const LABEL_KEYS: Record<Exclude<keyof CheckoutDictionary, "requiredFieldTemplate" | "invalidFieldTemplate">, string> = {
  cartTitle: "checkout.cart_title",
  loadingCart: "checkout.loading_cart",
  emptyCart: "checkout.empty_cart",
  remove: "checkout.remove",
  refreshCart: "checkout.refresh_cart",
  subtotal: "checkout.subtotal",
  shipping: "checkout.shipping",
  tax: "checkout.tax",
  total: "checkout.total",
  contactHeading: "checkout.contact_heading",
  email: "checkout.email",
  phone: "checkout.phone",
  deliveryHeading: "checkout.delivery_heading",
  country: "checkout.country",
  selectCountry: "checkout.select_country",
  shippingRate: "checkout.shipping_rate",
  chooseShippingRate: "checkout.choose_shipping_rate",
  billingHeading: "checkout.billing_heading",
  billingSameAsDelivery: "checkout.billing_same_as_delivery",
  paymentHeading: "checkout.payment_heading",
  paymentMethod: "checkout.payment_method",
  choosePaymentMethod: "checkout.choose_payment_method",
  orderSummaryHeading: "checkout.order_summary_heading",
  placeOrder: "checkout.place_order",
  placingOrder: "checkout.placing_order",
  genericError: "checkout.generic_error",
  retry: "checkout.retry",
  countryUnavailable: "checkout.error.country_unavailable",
};

const REQUIRED_FIELD_TEMPLATE_KEY = "checkout.error.required_field";
const INVALID_FIELD_TEMPLATE_KEY = "checkout.error.invalid_field";

// Fetches this store's resolved system labels (published translations for `locale`, falling back
// to the registry's English default per key) server-side. Same shape the admin Translations
// screen already writes to — no checkout-specific backend endpoint needed. Network/API failures
// fall back to an empty map so `buildCheckoutDictionary` below uses the English registry default
// for every key rather than breaking the cart page.
export async function fetchCheckoutLabels(locale: string): Promise<Record<string, string>> {
  try {
    const res = await storefrontFetch<{ data: Record<string, string> }>(
      `/system-labels?locale=${encodeURIComponent(locale)}`,
    );
    return res.data ?? {};
  } catch {
    return {};
  }
}

function resolve(labels: Record<string, string>, key: string): string {
  return labels[key] ?? SYSTEM_LABEL_REGISTRY[key] ?? key;
}

// Assembles the CheckoutDictionary the checkout UI renders from resolved system labels. Every
// language a merchant adds via the admin Languages screen works here with zero code changes, the
// same as the rest of the L4 system — there is no hardcoded per-language dictionary anymore.
export function buildCheckoutDictionary(labels: Record<string, string>): CheckoutDictionary {
  const dict = {} as CheckoutDictionary;
  for (const [field, key] of Object.entries(LABEL_KEYS) as [keyof typeof LABEL_KEYS, string][]) {
    (dict[field] as string) = resolve(labels, key);
  }
  dict.requiredFieldTemplate = resolve(labels, REQUIRED_FIELD_TEMPLATE_KEY);
  dict.invalidFieldTemplate = resolve(labels, INVALID_FIELD_TEMPLATE_KEY);
  return dict;
}

// Convenience for server components (app/cart/page.tsx): fetch + assemble in one call.
export async function getCheckoutDictionary(locale: string): Promise<CheckoutDictionary> {
  const labels = await fetchCheckoutLabels(locale);
  return buildCheckoutDictionary(labels);
}
