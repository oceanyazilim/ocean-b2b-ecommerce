import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";

import type { ChargeInput, ChargeResult, PaymentAdapter, RefundInput, RefundResult } from "../psp-adapter";

// Sandbox adapter for development and CI: no network calls, succeeds immediately. Amounts
// ending in .99 (i.e. minor-unit amount % 100 === 99) simulate a decline, mirroring the test
// card convention real PSPs use so error handling can be exercised without a real gateway.
@Injectable()
export class TestPaymentAdapter implements PaymentAdapter {
  readonly provider = "test";

  charge(input: ChargeInput): Promise<ChargeResult> {
    if (input.amount % 100 === 99) {
      return Promise.resolve({
        status: "failed",
        providerRef: null,
        failureReason: "Test card declined",
      });
    }
    return Promise.resolve({ status: "captured", providerRef: `test_${randomUUID()}` });
  }

  refund(_input: RefundInput): Promise<RefundResult> {
    return Promise.resolve({ status: "succeeded", providerRef: `test_re_${randomUUID()}` });
  }
}
