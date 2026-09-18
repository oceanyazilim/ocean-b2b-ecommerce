"use client";

import type { InvoiceDetail, InvoiceStatus, InvoiceSummary } from "@ocean/types";
import {
  Alert,
  Badge,
  Button,
  DataGrid,
  Dialog,
  FormField,
  Input,
  Select,
  Skeleton,
  type DataGridColumn,
} from "@ocean/ui";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { api, errorMessage } from "@/lib/api";
import { formatMoney, inputToMinor } from "@/lib/money";
import { useSubmit } from "@/lib/use-submit";

const STATUS_VARIANT: Record<InvoiceStatus, "warning" | "success" | "destructive" | "secondary"> = {
  pending: "warning",
  paid: "success",
  overdue: "destructive",
  cancelled: "secondary",
};

export function InvoicesManager({
  storeId,
  storeSlug,
  canWrite,
}: {
  storeId: string;
  storeSlug: string;
  canWrite: boolean;
}) {
  const [rows, setRows] = useState<InvoiceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<InvoiceStatus | "">("");
  const [creating, setCreating] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const qs = status ? `?status=${status}` : "";
      const res = await api<{ data: InvoiceSummary[] }>(`/stores/${storeId}/invoices${qs}`);
      setRows(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [storeId, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: DataGridColumn<InvoiceSummary>[] = [
    {
      key: "number",
      header: "Invoice",
      cell: (inv) => (
        <button className="font-medium hover:underline" onClick={() => setViewingId(inv.id)}>
          {inv.number}
        </button>
      ),
    },
    {
      key: "order",
      header: "Order",
      cell: (inv) => (
        <Link href={`/${storeSlug}/orders/${inv.orderId}`} className="hover:underline">
          View order
        </Link>
      ),
    },
    { key: "status", header: "Status", cell: (inv) => <Badge variant={STATUS_VARIANT[inv.status]}>{inv.status}</Badge> },
    { key: "amount", header: "Amount", className: "text-right", cell: (inv) => formatMoney(inv.amount) },
    { key: "balance", header: "Balance", className: "text-right", cell: (inv) => formatMoney(inv.balance) },
    { key: "dueAt", header: "Due", cell: (inv) => new Date(inv.dueAt).toLocaleDateString() },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={status} onChange={(e) => setStatus(e.target.value as InvoiceStatus | "")} className="w-40">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
          <option value="cancelled">Cancelled</option>
        </Select>
        {canWrite && <Button onClick={() => setCreating(true)}>Create invoice</Button>}
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(inv) => inv.id}
        loading={loading}
        empty={{
          title: "No invoices yet",
          description: "Invoice a B2B order to start tracking what's owed.",
          action: canWrite ? <Button onClick={() => setCreating(true)}>Create your first invoice</Button> : undefined,
        }}
      />
      <CreateInvoiceDialog storeId={storeId} open={creating} onClose={() => setCreating(false)} onSaved={() => void load()} />
      <InvoiceDetailDialog storeId={storeId} invoiceId={viewingId} canWrite={canWrite} onClose={() => setViewingId(null)} onChanged={() => void load()} />
    </div>
  );
}

function CreateInvoiceDialog({
  storeId,
  open,
  onClose,
  onSaved,
}: {
  storeId: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const submit = useSubmit();
  const { reset } = submit;
  const [orderId, setOrderId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (open) {
      reset();
      setOrderId("");
      setDueAt("");
      setAmount("");
    }
  }, [open, reset]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = {
      orderId,
      dueAt: dueAt ? new Date(dueAt).toISOString() : new Date().toISOString(),
      amount: amount.trim() ? (inputToMinor(amount) ?? undefined) : undefined,
    };
    const res = await submit.run(() => api(`/stores/${storeId}/invoices`, { body }));
    if (res !== undefined) {
      onSaved();
      onClose();
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create invoice"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button type="submit" form="invoice-form" loading={submit.pending}>
            Create
          </Button>
        </>
      }
    >
      <form id="invoice-form" onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        <FormField id="inv-order" label="Order ID" hint="Copy it from the order page's URL." error={submit.fieldErrors.orderId}>
          <Input id="inv-order" value={orderId} onChange={(e) => setOrderId(e.target.value)} required autoFocus />
        </FormField>
        <FormField id="inv-due" label="Due date" error={submit.fieldErrors.dueAt}>
          <Input id="inv-due" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} required />
        </FormField>
        <FormField id="inv-amount" label="Amount (blank = full order total)" error={submit.fieldErrors.amount}>
          <Input id="inv-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </FormField>
      </form>
    </Dialog>
  );
}

function InvoiceDetailDialog({
  storeId,
  invoiceId,
  canWrite,
  onClose,
  onChanged,
}: {
  storeId: string;
  invoiceId: string | null;
  canWrite: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [paymentId, setPaymentId] = useState("");
  const [amount, setAmount] = useState("");
  const submit = useSubmit();

  const load = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    try {
      const res = await api<{ data: InvoiceDetail }>(`/stores/${storeId}/invoices/${invoiceId}`);
      setDetail(res.data);
    } catch {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [storeId, invoiceId]);

  const { reset } = submit;
  useEffect(() => {
    if (invoiceId) {
      setPaymentId("");
      setAmount("");
      reset();
      void load();
    }
  }, [invoiceId, load, reset]);

  async function onRecordPayment(e: FormEvent) {
    e.preventDefault();
    if (!invoiceId) return;
    const res = await submit.run(() =>
      api(`/stores/${storeId}/invoices/${invoiceId}/payments`, {
        body: { paymentId, amount: inputToMinor(amount) ?? 0 },
      }),
    );
    if (res !== undefined) {
      setPaymentId("");
      setAmount("");
      await load();
      onChanged();
    }
  }

  return (
    <Dialog
      open={invoiceId !== null}
      onClose={onClose}
      title="Invoice"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      {loading || !detail ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-3 gap-2 text-sm">
            <dt className="text-muted-foreground">Amount</dt>
            <dd className="col-span-2 text-right">{formatMoney(detail.amount)}</dd>
            <dt className="text-muted-foreground">Paid</dt>
            <dd className="col-span-2 text-right">{formatMoney(detail.paidAmount)}</dd>
            <dt className="text-muted-foreground">Balance</dt>
            <dd className="col-span-2 text-right font-medium">{formatMoney(detail.balance)}</dd>
          </dl>
          <div>
            <h3 className="mb-1 text-sm font-medium">Payments</h3>
            <div className="max-h-32 overflow-y-auto rounded-md border text-sm">
              {detail.payments.length === 0 && <p className="px-3 py-2 text-muted-foreground">None recorded yet.</p>}
              {detail.payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between border-b px-3 py-1.5 last:border-0">
                  <span className="text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleString()}</span>
                  <span>{formatMoney(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>
          {canWrite && detail.status !== "paid" && detail.status !== "cancelled" && (
            <form onSubmit={(e) => void onRecordPayment(e)} className="flex flex-col gap-2 border-t pt-3">
              {submit.error && <Alert variant="error">{submit.error}</Alert>}
              <p className="text-sm font-medium">Record a payment</p>
              <FormField id="inv-payment-id" label="Payment ID" hint="From the order's Payments panel.">
                <Input id="inv-payment-id" value={paymentId} onChange={(e) => setPaymentId(e.target.value)} required />
              </FormField>
              <div className="flex gap-2">
                <Input inputMode="decimal" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <Button type="submit" loading={submit.pending}>
                  Record
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </Dialog>
  );
}
