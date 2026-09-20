import { getActiveLocale } from "@/lib/locale";

const CONFIRMATION_TEXT: Record<string, { thankYou: string; withOrder: (order: string) => string; noOrder: string }> = {
  en: {
    thankYou: "Thank you for your order",
    withOrder: (order) => `Your order reference is ${order}. We'll follow up by email.`,
    noOrder: "Your order has been placed.",
  },
  tr: {
    thankYou: "Siparişiniz için teşekkürler",
    withOrder: (order) => `Sipariş referansınız ${order}. E-posta ile bilgilendirileceksiniz.`,
    noOrder: "Siparişiniz alındı.",
  },
  de: {
    thankYou: "Vielen Dank für Ihre Bestellung",
    withOrder: (order) => `Ihre Bestellnummer lautet ${order}. Wir melden uns per E-Mail.`,
    noOrder: "Ihre Bestellung wurde aufgegeben.",
  },
};

export default async function CheckoutConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order } = await searchParams;
  const { locale } = await getActiveLocale();
  const primary = locale.split("-")[0]?.toLowerCase() ?? "en";
  const text = CONFIRMATION_TEXT[primary] ?? CONFIRMATION_TEXT.en!;

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-3 px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{text.thankYou}</h1>
      {order ? (
        <p className="text-muted-foreground">{text.withOrder(order)}</p>
      ) : (
        <p className="text-muted-foreground">{text.noOrder}</p>
      )}
    </div>
  );
}
