"use client";

import {
  PAYMENT_PROVIDERS,
  type PaymentMethodSummary,
  type PaymentProvider,
} from "@ocean/types";
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
  Select,
  Textarea,
  type DataGridColumn,
} from "@ocean/ui";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { api, errorMessage } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

const PROVIDER_LABEL: Record<PaymentProvider, string> = {
  manual: "Manual (offline, staff confirms receipt)",
  test: "Test (sandbox, auto-succeeds)",
};

type Editing = { kind: "new" } | { kind: "edit"; method: PaymentMethodSummary } | null;

export function PaymentMethodsManager({ storeId, canWrite }: { storeId: string; canWrite: boolean }) {
  const [rows, setRows] = useState<PaymentMethodSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<PaymentMethodSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const action = useSubmit();

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ data: PaymentMethodSummary[] }>(`/stores/${storeId}/payment-methods`);
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

  async function mutate(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    const ok = await action.run(fn);
    setBusyId(null);
    if (ok !== undefined) await load();
  }

  const columns: DataGridColumn<PaymentMethodSummary>[] = [
    { key: "name", header: "Name", cell: (m) => <span className="font-medium">{m.name}</span> },
    { key: "provider", header: "Provider", cell: (m) => PROVIDER_LABEL[m.provider] },
    {
      key: "status",
      header: "Status",
      cell: (m) => (
        <Badge variant={m.isEnabled ? "success" : "secondary"}>
          {m.isEnabled ? "Enabled" : "Disabled"}
        </Badge>
      ),
    },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "",
            className: "text-right",
            cell: (m: PaymentMethodSummary) => (
              <div className="flex flex-wrap justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing({ kind: "edit", method: m })}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busyId === m.id}
                  onClick={() =>
                    void mutate(m.id, () =>
                      api(`/stores/${storeId}/payment-methods/${m.id}`, {
                        method: "PATCH",
                        body: { isEnabled: !m.isEnabled },
                      }),
                    )
                  }
                >
                  {m.isEnabled ? "Disable" : "Enable"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(m)}>
                  Delete
                </Button>
              </div>
            ),
          } satisfies DataGridColumn<PaymentMethodSummary>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Ways buyers can pay at checkout. Manual methods (bank transfer, net terms) wait for staff
          to confirm; the test provider is for trying checkout without a real gateway.
        </p>
        {canWrite && <Button onClick={() => setEditing({ kind: "new" })}>Add payment method</Button>}
      </div>
      {(error ?? action.error) && <Alert variant="error">{error ?? action.error}</Alert>}
      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(m) => m.id}
        loading={loading}
        empty={{
          title: "No payment methods yet",
          description: "Add one so buyers can pay at checkout.",
          action: canWrite ? (
            <Button onClick={() => setEditing({ kind: "new" })}>Add your first method</Button>
          ) : undefined,
        }}
      />
      <MethodDialog
        storeId={storeId}
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => void load()}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name ?? "this payment method"}?`}
        destructive
        pending={busyId === deleting?.id}
        onConfirm={async () => {
          if (!deleting) return;
          await mutate(deleting.id, () =>
            api(`/stores/${storeId}/payment-methods/${deleting.id}`, { method: "DELETE" }),
          );
          setDeleting(null);
        }}
      />
    </div>
  );
}

function MethodDialog({
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
  const [provider, setProvider] = useState<PaymentProvider>("manual");
  const [instructions, setInstructions] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);
  const current = editing?.kind === "edit" ? editing.method : null;

  useEffect(() => {
    reset();
    setName(current?.name ?? "");
    setProvider(current?.provider ?? "manual");
    setInstructions(current?.instructions ?? "");
    setIsEnabled(current?.isEnabled ?? true);
  }, [current, editing, reset]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = { name, provider, instructions: instructions.trim() || null, isEnabled };
    const res = await submit.run(() =>
      current
        ? api(`/stores/${storeId}/payment-methods/${current.id}`, { method: "PATCH", body })
        : api(`/stores/${storeId}/payment-methods`, { body }),
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
      title={current ? "Edit payment method" : "Add payment method"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button type="submit" form="method-form" loading={submit.pending}>
            {current ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <form id="method-form" onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        <FormField id="pm-name" label="Name" error={submit.fieldErrors.name}>
          <Input
            id="pm-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
            autoFocus
          />
        </FormField>
        <FormField id="pm-provider" label="Provider">
          <Select
            id="pm-provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value as PaymentProvider)}
          >
            {PAYMENT_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABEL[p]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="pm-instructions" label="Instructions shown to the buyer (optional)">
          <Textarea
            id="pm-instructions"
            rows={3}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            maxLength={2000}
          />
        </FormField>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={isEnabled} onChange={(e) => setIsEnabled(e.target.checked)} />
          Enabled at checkout
        </label>
      </form>
    </Dialog>
  );
}
