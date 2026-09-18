"use client";

import type { MarketSummary } from "@ocean/types";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  DataGrid,
  Dialog,
  FormField,
  Input,
  type DataGridColumn,
} from "@ocean/ui";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { api, errorMessage } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

type Editing = { kind: "new" } | { kind: "edit"; market: MarketSummary } | null;

export function MarketsManager({ storeId, canWrite }: { storeId: string; canWrite: boolean }) {
  const [rows, setRows] = useState<MarketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<MarketSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const action = useSubmit();

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ data: MarketSummary[] }>(`/stores/${storeId}/markets`);
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

  const columns: DataGridColumn<MarketSummary>[] = [
    {
      key: "name",
      header: "Market",
      cell: (m) => (
        <span className="font-medium">
          {m.name} {m.isDefault && <Badge variant="secondary">Default</Badge>}
        </span>
      ),
    },
    { key: "countryCode", header: "Country", cell: (m) => m.countryCode },
    { key: "currency", header: "Currency", cell: (m) => m.currency },
    { key: "locale", header: "Locale", cell: (m) => m.locale },
    {
      key: "status",
      header: "Status",
      cell: (m) => <Badge variant={m.isActive ? "success" : "secondary"}>{m.isActive ? "Active" : "Inactive"}</Badge>,
    },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "",
            className: "text-right",
            cell: (m: MarketSummary) => (
              <div className="flex flex-wrap justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing({ kind: "edit", market: m })}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(m)}>
                  Delete
                </Button>
              </div>
            ),
          } satisfies DataGridColumn<MarketSummary>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Markets group buyers by country, currency, and locale for the storefront.
        </p>
        {canWrite && <Button onClick={() => setEditing({ kind: "new" })}>Add market</Button>}
      </div>
      {(error ?? action.error) && <Alert variant="error">{error ?? action.error}</Alert>}
      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(m) => m.id}
        loading={loading}
        empty={{
          title: "No markets yet",
          description: "Add one so the storefront can price and localize for buyers there.",
          action: canWrite ? <Button onClick={() => setEditing({ kind: "new" })}>Add your first market</Button> : undefined,
        }}
      />
      <MarketDialog storeId={storeId} editing={editing} onClose={() => setEditing(null)} onSaved={() => void load()} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name ?? "this market"}?`}
        destructive
        pending={busyId === deleting?.id}
        onConfirm={async () => {
          if (!deleting) return;
          setBusyId(deleting.id);
          const ok = await action.run(() => api(`/stores/${storeId}/markets/${deleting.id}`, { method: "DELETE" }));
          setBusyId(null);
          if (ok !== undefined) await load();
          setDeleting(null);
        }}
      />
    </div>
  );
}

function MarketDialog({
  storeId,
  editing,
  onClose,
  onSaved,
}: {
  storeId: string;
  editing: Editing;
  onClose: () => void;
  onSaved: () => void;
}) {
  const submit = useSubmit();
  const { reset } = submit;
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [currency, setCurrency] = useState("");
  const [locale, setLocale] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const current = editing?.kind === "edit" ? editing.market : null;

  useEffect(() => {
    reset();
    setName(current?.name ?? "");
    setCountryCode(current?.countryCode ?? "");
    setCurrency(current?.currency ?? "");
    setLocale(current?.locale ?? "");
    setIsDefault(current?.isDefault ?? false);
    setIsActive(current?.isActive ?? true);
  }, [current, editing, reset]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = {
      name,
      countryCode: countryCode.trim().toUpperCase(),
      currency: currency.trim().toUpperCase(),
      locale,
      isDefault,
      isActive,
    };
    const res = await submit.run(() =>
      current
        ? api(`/stores/${storeId}/markets/${current.id}`, { method: "PATCH", body })
        : api(`/stores/${storeId}/markets`, { body }),
    );
    if (res !== undefined) {
      onSaved();
      onClose();
    }
  }

  return (
    <Dialog
      open={editing !== null}
      onClose={onClose}
      title={current ? "Edit market" : "Add market"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button type="submit" form="market-form" loading={submit.pending}>
            {current ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <form id="market-form" onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        <FormField id="market-name" label="Name" error={submit.fieldErrors.name}>
          <Input id="market-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoFocus />
        </FormField>
        <FormField id="market-country" label="Country code" error={submit.fieldErrors.countryCode}>
          <Input
            id="market-country"
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
            required
            maxLength={2}
            placeholder="TR"
          />
        </FormField>
        <FormField id="market-currency" label="Currency" error={submit.fieldErrors.currency}>
          <Input
            id="market-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            required
            maxLength={3}
            placeholder="TRY"
          />
        </FormField>
        <FormField id="market-locale" label="Locale" error={submit.fieldErrors.locale}>
          <Input id="market-locale" value={locale} onChange={(e) => setLocale(e.target.value)} required placeholder="tr-TR" />
        </FormField>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          Default market
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>
      </form>
    </Dialog>
  );
}
