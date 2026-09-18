// PSP adapter interface (Phase 7 spec item: "PSP adapter interface + first adapter"). Every
// provider a store can pick as a PaymentMethod.provider registers one of these; the payments
// service never talks to a gateway directly, only through this contract.

export interface ChargeInput {
  amount: number; // minor units
  currency: string;
  orderId: string;
  config: Record<string, unknown>;
}

export interface ChargeResult {
  status: "captured" | "pending" | "failed";
  providerRef: string | null;
  failureReason?: string;
}

export interface RefundInput {
  amount: number;
  currency: string;
  providerRef: string | null;
  config: Record<string, unknown>;
}

export interface RefundResult {
  status: "succeeded" | "pending" | "failed";
  providerRef: string | null;
  failureReason?: string;
}

export interface PaymentAdapter {
  readonly provider: string;
  charge(input: ChargeInput): Promise<ChargeResult>;
  refund(input: RefundInput): Promise<RefundResult>;
}

export const PAYMENT_ADAPTERS = Symbol("PAYMENT_ADAPTERS");
