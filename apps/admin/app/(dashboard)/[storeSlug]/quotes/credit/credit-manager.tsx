"use client";

import type { CompanyCandidate, CreditAccountDetail, CreditAccountSummary, CreditExceedPolicy } from "@ocean/types";
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
  Textarea,
  type DataGridColumn,
} from "@ocean/ui";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { CompanyPicker, LocationSelect } from "@/components/pickers";
import { api, errorMessage } from "@/lib/api";
import { formatMoney, inputToMinor } from "@/lib/money";
import { useSubmit } from "@/lib/use-submit";

export function CreditManager({ storeId, canWrite }: { storeId: string; canWrite: boolean }) {
  const [rows, setRows] = useState<CreditAccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ data: CreditAccountSummary[] }>(`/stores/${storeId}/credit-accounts`);
      setRows(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: DataGridColumn<CreditAccountSummary>[] = [
    {
      key: "account",
      header: "Account",
      cell: (a) => (
        <button className="font-medium hover:underline" onClick={() => setViewingId(a.id)}>
          {a.companyId ? "Company account" : "Location account"}
        </button>
      ),
    },
    { key: "limit", header: "Limit", className: "text-right", cell: (a) => formatMoney(a.limit) },
    { key: "used", header: "Used", className: "text-right", cell: (a) => formatMoney(a.used) },
    { key: "available", header: "Available", className: "text-right", cell: (a) => formatMoney(a.available) },
    { key: "policy", header: "On exceed", cell: (a) => <Badge variant="secondary">{a.onExceedPolicy}</Badge> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Credit limits for companies buying on payment terms. Usage moves with orders and manual adjustments.
        </p>
        {canWrite && <Button onClick={() => setCreating(true)}>Add credit account</Button>}
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(a) => a.id}
        loading={loading}
        empty={{
          title: "No credit accounts yet",
          description: "Add one so a company can buy on payment terms.",
          action: canWrite ? <Button onClick={() => setCreating(true)}>Add your first account</Button> : undefined,
        }}
      />
      <CreateCreditDialog storeId={storeId} open={creating} onClose={() => setCreating(false)} onSaved={() => void load()} />
      <CreditDetailDialog
        storeId={storeId}
        accountId={viewingId}
        canWrite={canWrite}
        onClose={() => setViewingId(null)}
        onChanged={() => void load()}
      />
    </div>
  );
}

function CreateCreditDialog({
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
  const [company, setCompany] = useState<CompanyCandidate | null>(null);
  const [locationId, setLocationId] = useState("");
  const [limit, setLimit] = useState("");
  const [currency, setCurrency] = useState("TRY");
  const [policy, setPolicy] = useState<CreditExceedPolicy>("reject");

  useEffect(() => {
    if (open) {
      reset();
      setCompany(null);
      setLocationId("");
      setLimit("");
      setCurrency("TRY");
      setPolicy("reject");
    }
  }, [open, reset]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = {
      companyId: locationId ? null : (company?.id ?? null),
      companyLocationId: locationId || null,
      limit: inputToMinor(limit) ?? 0,
      currency,
      onExceedPolicy: policy,
    };
    const res = await submit.run(() => api(`/stores/${storeId}/credit-accounts`, { body }));
    if (res !== undefined) {
      onSaved();
      onClose();
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add credit account"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button type="submit" form="credit-form" loading={submit.pending}>
            Create
          </Button>
        </>
      }
    >
      <form id="credit-form" onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        <CompanyPicker storeId={storeId} value={company} onChange={setCompany} error={submit.fieldErrors.companyId} />
        <LocationSelect
          storeId={storeId}
          companyId={company?.id ?? null}
          value={locationId}
          onChange={setLocationId}
          hint="Leave blank for a company-wide account, or pick a location for a location-specific one."
        />
        <FormField id="credit-limit" label="Limit" error={submit.fieldErrors.limit}>
          <Input id="credit-limit" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} required />
        </FormField>
        <FormField id="credit-currency" label="Currency">
          <Input id="credit-currency" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
        </FormField>
        <FormField id="credit-policy" label="On exceed">
          <Select id="credit-policy" value={policy} onChange={(e) => setPolicy(e.target.value as CreditExceedPolicy)}>
            <option value="reject">Reject the order</option>
            <option value="warn">Warn but allow</option>
            <option value="allow">Allow silently</option>
          </Select>
        </FormField>
      </form>
    </Dialog>
  );
}

function CreditDetailDialog({
  storeId,
  accountId,
  canWrite,
  onClose,
  onChanged,
}: {
  storeId: string;
  accountId: string | null;
  canWrite: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<CreditAccountDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const submit = useSubmit();

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const res = await api<{ data: CreditAccountDetail }>(`/stores/${storeId}/credit-accounts/${accountId}`);
      setDetail(res.data);
    } catch {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [storeId, accountId]);

  const { reset } = submit;
  useEffect(() => {
    if (accountId) {
      setDelta("");
      setNote("");
      reset();
      void load();
    }
  }, [accountId, load, reset]);

  async function onAdjust(e: FormEvent) {
    e.preventDefault();
    if (!accountId) return;
    const res = await submit.run(() =>
      api(`/stores/${storeId}/credit-accounts/${accountId}/adjust`, {
        body: { delta: inputToMinor(delta) ?? 0, note: note.trim() || null },
      }),
    );
    if (res !== undefined) {
      setDelta("");
      setNote("");
      await load();
      onChanged();
    }
  }

  return (
    <Dialog
      open={accountId !== null}
      onClose={onClose}
      title="Credit account"
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
            <dt className="text-muted-foreground">Limit</dt>
            <dd className="col-span-2 text-right">{formatMoney(detail.limit)}</dd>
            <dt className="text-muted-foreground">Used</dt>
            <dd className="col-span-2 text-right">{formatMoney(detail.used)}</dd>
            <dt className="text-muted-foreground">Available</dt>
            <dd className="col-span-2 text-right font-medium">{formatMoney(detail.available)}</dd>
          </dl>
          <div>
            <h3 className="mb-1 text-sm font-medium">Ledger</h3>
            <div className="max-h-40 overflow-y-auto rounded-md border text-sm">
              {detail.ledger.length === 0 && <p className="px-3 py-2 text-muted-foreground">No entries yet.</p>}
              {detail.ledger.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between border-b px-3 py-1.5 last:border-0">
                  <span className="text-xs text-muted-foreground">
                    {entry.referenceType} · {new Date(entry.createdAt).toLocaleString()}
                  </span>
                  <span className={entry.delta.amount < 0 ? "text-success" : ""}>{formatMoney(entry.delta)}</span>
                </div>
              ))}
            </div>
          </div>
          {canWrite && (
            <form onSubmit={(e) => void onAdjust(e)} className="flex flex-col gap-2 border-t pt-3">
              {submit.error && <Alert variant="error">{submit.error}</Alert>}
              <p className="text-sm font-medium">Manual adjustment</p>
              <div className="flex gap-2">
                <Input inputMode="decimal" placeholder="Delta (+/-)" value={delta} onChange={(e) => setDelta(e.target.value)} />
                <Button type="submit" loading={submit.pending}>
                  Apply
                </Button>
              </div>
              <Textarea placeholder="Note (optional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </form>
          )}
        </div>
      )}
    </Dialog>
  );
}
