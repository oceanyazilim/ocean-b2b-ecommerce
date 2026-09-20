import { CartView } from "@/components/cart-view";
import { checkoutDictionary } from "@/lib/checkout-i18n";
import { getActiveLocale } from "@/lib/locale";
import { listCountries, listPaymentMethods } from "@/lib/storefront";

export default async function CartPage() {
  const [paymentMethods, countries, { locale }] = await Promise.all([
    listPaymentMethods().catch(() => []),
    listCountries().catch(() => []),
    getActiveLocale(),
  ]);
  const t = checkoutDictionary(locale);
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="px-6 pt-10 text-2xl font-semibold tracking-tight">{t.cartTitle}</h1>
      <CartView paymentMethods={paymentMethods} countries={countries} locale={locale} />
    </div>
  );
}
