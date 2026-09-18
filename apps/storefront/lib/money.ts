import type { Money } from "@ocean/types";

export function formatMoney(money: Money | null | undefined, locale = "tr-TR"): string {
  if (!money) return "—";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: money.currency }).format(
      money.amount / 100,
    );
  } catch {
    return `${(money.amount / 100).toFixed(2)} ${money.currency}`;
  }
}
