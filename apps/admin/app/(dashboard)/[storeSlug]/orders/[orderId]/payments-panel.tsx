"use client";

import type { PaymentSummary, RefundSummary } from "@ocean/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  ConfirmDialog,
  Dialog,
  FormField,
  Input,
  Textarea,
  type BadgeVariant,
} from "@ocean/ui";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { api } from "@/lib/api";
import { formatMoney, inputToMinor } from "@/lib/money";
import { useSubmit } from "@/lib/use-submit";

const PAYMENT_VARIANT: Record<PaymentSummary["status"], BadgeVariant> = {
  pending: "warning",
  authorized: "default",
  captured: "success",
  voided: "secondary",
  failed: "destructive",
};
const REFUND_VARIANT: Record<RefundSummary["status"], BadgeVariant> = {
  pending: "warning",
  succeeded: "success",
  failed: "destructive",
};

export function PaymentsPanel({
  storeId,
  orderId,
  payments,
  refunds,
  canManagePayments,
  canRefund,
}: {
  storeId: string;
  orderId: string;
  payments: PaymentSummary[];
  refunds: RefundSummary[];
  canManagePayments: boolean;
  canRefund: boolean;
}) {
  const router = useRouter();
  const submit = useSubmit();
  const base = `/stores/${storeId}/orders/${orderId}`;
  const [voiding, setVoiding] = useState<string | null>(null);
  const [refunding, setRefunding] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(false);

  async function onConfirm(paymentId: string) {
    const res = await submit.run(() => api(`${base}/payments/${paymentId}/confirm`, { body: {} }));
    if (res !== undefined) router.refresh();
  }

  async function onVoid() {
    if (!voiding) return;
    const res = await submit.run(() => api(`${base}/payments/${voiding}/void`, { body: {} }));
    if (res !== undefined) {
      setVoiding(null);
      router.refresh();
    }
  }

  async function onRefund(e: FormEvent) {
    e.preventDefault();
    const minor = inputToMinor(amount);
    if (!minor) return;
    const res = await submit.run(() =>
      api(`${base}/refunds`, {
        body: { amount: minor, reason: reason.trim() || null, restock, items: [] },
      }),
    );
    if (res !== undefined) {
      setRefunding(false);
      setAmount("");
      setReason("");
      setRestock(false);
      router.refresh();
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Payments</CardTitle>
        {canRefund && payments.some((p) => p.status === "captured") && (
          <Button type="button" variant="outline" size="sm" onClick={() => setRefunding(true)}>
            Refund
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        {payments.length === 0 && <p className="text-muted-foreground">No payments yet.</p>}
        <div className="flex flex-col divide-y">
          {payments.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <div className="font-medium">
                  {p.methodName} <span className="text-muted-foreground">· {p.provider}</span>
                </div>
                {p.failureReason && <div className="text-xs text-destructive">{p.failureReason}</div>}
              </div>
              <div className="flex items-center gap-2">
                <span className="tabular-nums">{formatMoney(p.amount)}</span>
                <Badge variant={PAYMENT_VARIANT[p.status]}>{p.status}</Badge>
                {canManagePayments && p.status === "pending" && (
                  <>
                    <Button type="button" size="sm" onClick={() => void onConfirm(p.id)}>
                      Confirm
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setVoiding(p.id)}
                    >
                      Void
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        {refunds.length > 0 && (
          <div className="flex flex-col gap-2 border-t pt-3">
            <div className="text-xs font-medium text-muted-foreground">Refunds</div>
            {refunds.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">{r.reason ?? "Refund"}</span>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums">{formatMoney(r.amount)}</span>
                  <Badge variant={REFUND_VARIANT[r.status]}>{r.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={voiding !== null}
        onClose={() => setVoiding(null)}
        onConfirm={() => void onVoid()}
        title="Void this payment?"
        description="It will no longer count toward what the buyer owes."
        destructive
        pending={submit.pending}
      />

      <Dialog
        open={refunding}
        onClose={() => setRefunding(false)}
        title="Refund"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRefunding(false)} disabled={submit.pending}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="refund-form"
              variant="destructive"
              loading={submit.pending}
              disabled={!inputToMinor(amount)}
            >
              Refund
            </Button>
          </>
        }
      >
        <form id="refund-form" onSubmit={(e) => void onRefund(e)} className="flex flex-col gap-3">
          <FormField id="refund-amount" label="Amount" error={submit.fieldErrors.amount}>
            <Input
              id="refund-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              autoFocus
            />
          </FormField>
          <FormField id="refund-reason" label="Reason" error={submit.fieldErrors.reason}>
            <Textarea
              id="refund-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
            />
          </FormField>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={restock} onChange={(e) => setRestock(e.target.checked)} />
            Restock at the default location
          </label>
        </form>
      </Dialog>
    </Card>
  );
}
