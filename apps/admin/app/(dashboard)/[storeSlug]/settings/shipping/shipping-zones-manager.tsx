"use client";

import type { ShippingZoneSummary } from "@ocean/types";
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
  TagInput,
  type DataGridColumn,
} from "@ocean/ui";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { api, errorMessage } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

type Editing = { kind: "new" } | { kind: "edit"; zone: ShippingZoneSummary } | null;

export function ShippingZonesManager({
  storeId,
  storeSlug,
  canWrite,
}: {
  storeId: string;
  storeSlug: string;
  canWrite: boolean;
}) {
  const [rows, setRows] = useState<ShippingZoneSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<ShippingZoneSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const action = useSubmit();

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ data: ShippingZoneSummary[] }>(`/stores/${storeId}/shipping/zones`);
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

  const columns: DataGridColumn<ShippingZoneSummary>[] = [
    {
      key: "name",
      header: "Zone",
      cell: (z) => (
        <Link href={`/${storeSlug}/settings/shipping/${z.id}`} className="font-medium hover:underline">
          {z.name}
        </Link>
      ),
    },
    {
      key: "countries",
      header: "Countries",
      cell: (z) => (
        <span className="text-muted-foreground">
          {z.countries.includes("*") ? "Everywhere else" : z.countries.join(", ") || "—"}
        </span>
      ),
    },
    {
      key: "rates",
      header: "Rates",
      className: "text-right",
      cell: (z) => <span className="tabular-nums">{z.rateCount}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (z) => (
        <Badge variant={z.isActive ? "success" : "secondary"}>
          {z.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "",
            className: "text-right",
            cell: (z: ShippingZoneSummary) => (
              <div className="flex flex-wrap justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing({ kind: "edit", zone: z })}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(z)}>
                  Delete
                </Button>
              </div>
            ),
          } satisfies DataGridColumn<ShippingZoneSummary>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Group countries into zones, then add rates inside each zone. Use{" "}
          <code className="rounded bg-muted px-1">*</code> for a catch-all zone covering countries
          with no more specific zone.
        </p>
        {canWrite && <Button onClick={() => setEditing({ kind: "new" })}>Add zone</Button>}
      </div>
      {(error ?? action.error) && <Alert variant="error">{error ?? action.error}</Alert>}
      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(z) => z.id}
        loading={loading}
        empty={{
          title: "No shipping zones yet",
          description: "Add one so checkout can offer a shipping rate.",
          action: canWrite ? <Button onClick={() => setEditing({ kind: "new" })}>Add your first zone</Button> : undefined,
        }}
      />
      <ZoneDialog
        storeId={storeId}
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => void load()}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name ?? "this zone"}?`}
        description="Its rates are deleted too."
        destructive
        pending={busyId === deleting?.id}
        onConfirm={async () => {
          if (!deleting) return;
          await mutate(deleting.id, () => api(`/stores/${storeId}/shipping/zones/${deleting.id}`, { method: "DELETE" }));
          setDeleting(null);
        }}
      />
    </div>
  );
}

function ZoneDialog({
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
  const [countries, setCountries] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const current = editing?.kind === "edit" ? editing.zone : null;

  useEffect(() => {
    reset();
    setName(current?.name ?? "");
    setCountries(current?.countries ?? []);
    setIsActive(current?.isActive ?? true);
  }, [current, editing, reset]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = { name, countries: countries.map((c) => c.trim().toUpperCase()), isActive };
    const res = await submit.run(() =>
      current
        ? api(`/stores/${storeId}/shipping/zones/${current.id}`, { method: "PATCH", body })
        : api(`/stores/${storeId}/shipping/zones`, { body }),
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
      title={current ? "Edit zone" : "Add zone"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button type="submit" form="zone-form" loading={submit.pending}>
            {current ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <form id="zone-form" onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        <FormField id="zone-name" label="Name" error={submit.fieldErrors.name}>
          <Input
            id="zone-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
            autoFocus
          />
        </FormField>
        <FormField id="zone-countries" label="Countries" error={submit.fieldErrors.countries}>
          <TagInput id="zone-countries" value={countries} onChange={setCountries} />
        </FormField>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>
      </form>
    </Dialog>
  );
}
