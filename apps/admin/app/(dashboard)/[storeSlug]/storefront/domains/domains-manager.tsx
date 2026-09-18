"use client";

import type { DomainSummary } from "@ocean/types";
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

const STATUS_VARIANT: Record<DomainSummary["status"], "success" | "warning" | "destructive"> = {
  verified: "success",
  pending: "warning",
  failed: "destructive",
};

export function DomainsManager({ storeId, canWrite }: { storeId: string; canWrite: boolean }) {
  const [rows, setRows] = useState<DomainSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<DomainSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const action = useSubmit();

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ data: DomainSummary[] }>(`/stores/${storeId}/domains`);
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

  async function verify(d: DomainSummary) {
    setBusyId(d.id);
    const ok = await action.run(() => api(`/stores/${storeId}/domains/${d.id}/verify`, { method: "POST" }));
    setBusyId(null);
    if (ok !== undefined) await load();
  }

  const columns: DataGridColumn<DomainSummary>[] = [
    {
      key: "hostname",
      header: "Domain",
      cell: (d) => (
        <span className="font-medium">
          {d.hostname} {d.isPrimary && <Badge variant="secondary">Primary</Badge>}
        </span>
      ),
    },
    { key: "type", header: "Type", cell: (d) => d.type },
    {
      key: "status",
      header: "Status",
      cell: (d) => <Badge variant={STATUS_VARIANT[d.status]}>{d.status}</Badge>,
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (d) => (
        <div className="flex flex-wrap justify-end gap-1">
          {canWrite && d.status !== "verified" && (
            <Button size="sm" variant="ghost" loading={busyId === d.id} onClick={() => void verify(d)}>
              Verify
            </Button>
          )}
          {canWrite && (
            <Button size="sm" variant="ghost" onClick={() => setDeleting(d)}>
              Delete
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Connect a custom domain so buyers can reach the storefront at your own hostname.
        </p>
        {canWrite && <Button onClick={() => setAdding(true)}>Add domain</Button>}
      </div>
      {(error ?? action.error) && <Alert variant="error">{error ?? action.error}</Alert>}
      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(d) => d.id}
        loading={loading}
        empty={{
          title: "No domains yet",
          description: "The storefront is only reachable at its default hostname until you add one.",
          action: canWrite ? <Button onClick={() => setAdding(true)}>Add your first domain</Button> : undefined,
        }}
      />
      <AddDomainDialog
        storeId={storeId}
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={() => void load()}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.hostname ?? "this domain"}?`}
        destructive
        pending={busyId === deleting?.id}
        onConfirm={async () => {
          if (!deleting) return;
          setBusyId(deleting.id);
          const ok = await action.run(() => api(`/stores/${storeId}/domains/${deleting.id}`, { method: "DELETE" }));
          setBusyId(null);
          if (ok !== undefined) await load();
          setDeleting(null);
        }}
      />
    </div>
  );
}

function AddDomainDialog({
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
  const [hostname, setHostname] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);

  useEffect(() => {
    if (open) {
      reset();
      setHostname("");
      setIsPrimary(false);
    }
  }, [open, reset]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const res = await submit.run(() =>
      api(`/stores/${storeId}/domains`, { body: { hostname, type: "custom", isPrimary } }),
    );
    if (res !== undefined) {
      onSaved();
      onClose();
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add domain"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button type="submit" form="domain-form" loading={submit.pending}>
            Add
          </Button>
        </>
      }
    >
      <form id="domain-form" onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        <FormField id="domain-hostname" label="Hostname" error={submit.fieldErrors.hostname}>
          <Input
            id="domain-hostname"
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            required
            placeholder="shop.example.com"
            autoFocus
          />
        </FormField>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} />
          Make primary
        </label>
      </form>
    </Dialog>
  );
}
