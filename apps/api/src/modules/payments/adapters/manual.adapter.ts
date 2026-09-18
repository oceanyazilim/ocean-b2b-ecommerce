import { Injectable } from "@nestjs/common";

import type { ChargeInput, ChargeResult, PaymentAdapter, RefundInput, RefundResult } from "../psp-adapter";

// Offline settlement: bank transfer, cheque, cash on delivery, net-terms invoicing. Nothing is
// charged automatically; staff confirm receipt (PaymentsService.confirm) and refunds
// (PaymentsService.confirmRefund) by hand once money has actually moved.
@Injectable()
export class ManualPaymentAdapter implements PaymentAdapter {
  readonly provider = "manual";

  charge(_input: ChargeInput): Promise<ChargeResult> {
    return Promise.resolve({ status: "pending", providerRef: null });
  }

  refund(_input: RefundInput): Promise<RefundResult> {
    return Promise.resolve({ status: "pending", providerRef: null });
  }
}
