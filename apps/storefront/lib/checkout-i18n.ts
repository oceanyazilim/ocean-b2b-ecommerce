// Localized checkout (spec section 45): "Checkout language should automatically follow storefront
// language. Translate: Contact, Delivery, Payment, Billing, Order summary, Errors, Validation."
// The storefront's active locale (lib/locale.ts, L4) already drives every product/content string;
// this is the matching dictionary for the checkout UI's own chrome — the labels, section
// headings and messages that aren't data from a CountryProfile or a product. Deliberately
// separate from the per-country address FIELD labels (e.g. TR's "Mahalle"): those come from
// CountryProfile.addressSchema and are already written in that country's own language (a Turkish
// delivery form uses Turkish field names regardless of which language the buyer is browsing the
// rest of the site in) — this dictionary only covers the surrounding checkout copy that should
// follow the buyer's chosen storefront language.
//
// Coverage is honest, not universal: every CountryProfile a country can be added in any
// language, so this dictionary can never promise full coverage the way the address-schema engine
// does. It covers the storefront's two most real languages so far (English, Turkish) plus German
// (DE is one of the four seeded CountryProfiles), and always falls back to English for anything
// else — never a blank or a raw key.

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
  requiredField: (label: string) => string;
  invalidField: (label: string) => string;
}

const en: CheckoutDictionary = {
  cartTitle: "Cart",
  loadingCart: "Loading your cart…",
  emptyCart: "Your cart is empty.",
  remove: "Remove",
  refreshCart: "Refresh cart",
  subtotal: "Subtotal",
  shipping: "Shipping",
  tax: "Tax",
  total: "Total",
  contactHeading: "Contact",
  email: "Email",
  phone: "Phone",
  deliveryHeading: "Delivery",
  country: "Country",
  selectCountry: "Select a country...",
  shippingRate: "Shipping rate",
  chooseShippingRate: "Choose a shipping rate",
  billingHeading: "Billing",
  billingSameAsDelivery: "Billing address same as delivery address",
  paymentHeading: "Payment",
  paymentMethod: "Payment method",
  choosePaymentMethod: "Choose a payment method",
  orderSummaryHeading: "Order summary",
  placeOrder: "Place order",
  placingOrder: "Placing order…",
  genericError: "Something unexpected happened. Please try again.",
  requiredField: (label) => `${label} is required`,
  invalidField: (label) => `${label} is not valid`,
};

const tr: CheckoutDictionary = {
  cartTitle: "Sepet",
  loadingCart: "Sepetiniz yükleniyor…",
  emptyCart: "Sepetiniz boş.",
  remove: "Kaldır",
  refreshCart: "Sepeti yenile",
  subtotal: "Ara toplam",
  shipping: "Kargo",
  tax: "Vergi",
  total: "Toplam",
  contactHeading: "İletişim",
  email: "E-posta",
  phone: "Telefon",
  deliveryHeading: "Teslimat",
  country: "Ülke",
  selectCountry: "Ülke seçin...",
  shippingRate: "Kargo seçeneği",
  chooseShippingRate: "Bir kargo seçeneği seçin",
  billingHeading: "Fatura",
  billingSameAsDelivery: "Fatura adresi teslimat adresiyle aynı",
  paymentHeading: "Ödeme",
  paymentMethod: "Ödeme yöntemi",
  choosePaymentMethod: "Bir ödeme yöntemi seçin",
  orderSummaryHeading: "Sipariş özeti",
  placeOrder: "Siparişi tamamla",
  placingOrder: "Sipariş veriliyor…",
  genericError: "Beklenmedik bir şey oldu. Lütfen tekrar deneyin.",
  requiredField: (label) => `${label} zorunludur`,
  invalidField: (label) => `${label} geçerli değil`,
};

const de: CheckoutDictionary = {
  cartTitle: "Warenkorb",
  loadingCart: "Ihr Warenkorb wird geladen…",
  emptyCart: "Ihr Warenkorb ist leer.",
  remove: "Entfernen",
  refreshCart: "Warenkorb aktualisieren",
  subtotal: "Zwischensumme",
  shipping: "Versand",
  tax: "Steuer",
  total: "Gesamtsumme",
  contactHeading: "Kontakt",
  email: "E-Mail",
  phone: "Telefon",
  deliveryHeading: "Lieferung",
  country: "Land",
  selectCountry: "Land auswählen...",
  shippingRate: "Versandart",
  chooseShippingRate: "Versandart auswählen",
  billingHeading: "Rechnung",
  billingSameAsDelivery: "Rechnungsadresse entspricht der Lieferadresse",
  paymentHeading: "Zahlung",
  paymentMethod: "Zahlungsmethode",
  choosePaymentMethod: "Zahlungsmethode auswählen",
  orderSummaryHeading: "Bestellübersicht",
  placeOrder: "Bestellung aufgeben",
  placingOrder: "Bestellung wird aufgegeben…",
  genericError: "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.",
  requiredField: (label) => `${label} ist erforderlich`,
  invalidField: (label) => `${label} ist ungültig`,
};

const DICTIONARIES: Record<string, CheckoutDictionary> = { en, tr, de };

// `locale` is a BCP-47 tag like "tr-TR" or "en-US" (see lib/locale.ts) — only the primary
// language subtag selects the dictionary, falling back to English for any language this
// checkout hasn't been translated into yet.
export function checkoutDictionary(locale: string): CheckoutDictionary {
  const primary = locale.split("-")[0]?.toLowerCase() ?? "en";
  return DICTIONARIES[primary] ?? en;
}
