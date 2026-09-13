import type { Money } from "@ocean/types";

// All prices travel as integer minor units; the UI edits them as decimal major units.
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

export function minorToInput(amount: number | null | undefined): string {
  return amount === null || amount === undefined ? "" : (amount / 100).toFixed(2);
}

export function inputToMinor(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}
