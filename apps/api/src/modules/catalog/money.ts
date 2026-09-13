import type { Money } from "@ocean/types";

// Prices are stored as BigInt minor units; the API exposes safe integers.
export function toMoney(amount: bigint | number, currency: string): Money {
  return { amount: Number(amount), currency };
}

export function toMoneyOrNull(amount: bigint | number | null, currency: string): Money | null {
  return amount === null ? null : toMoney(amount, currency);
}
