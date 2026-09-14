"use client";

import { LOCATION_TYPES, type LocationSummary, type LocationType } from "@ocean/types";
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

type Editing = { kind: "new" } | { kind: "edit"; location: LocationSummary } | null;

export function LocationsManager({ storeId, canWrite }: { storeId: string; canWrite: boolean }) {
  const [rows, setRows] = useState<LocationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<LocationSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const action = useSubmit();

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ data: LocationSummary[] }>(`/stores/${storeId}/locations`);
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

  const columns: DataGridColumn<LocationSummary>[] = [
    {
      key: "name",
      header: "Location",
      cell: (l) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{l.name}</span>
          {l.isDefault && <Badge>Default</Badge>}
        </div>
      ),
    },
    { key: "type", header: "Type", cell: (l) => <span className="capitalize">{l.type}</span> },
    {
      key: "address",
      header: "Address",
      cell: (l) => <span className="text-muted-foreground">{l.address ?? "—"}</span>,
    },
    {
      key: "items",
      header: "Stocked items",
      className: "text-right",
      cell: (l) => <span className="tabular-nums">{l.stockedItemCount}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (l) => (
        <Badge variant={l.isActive ? "success" : "secondary"}>
          {l.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "",
            className: "text-right",
            cell: (l: LocationSummary) => (
              <div className="flex flex-wrap justify-end gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing({ kind: "edit", location: l })}
                >
                  Edit
                </Button>
                {!l.isDefault && l.isActive && (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={busyId === l.id}
                    onClick={() =>
                      void mutate(l.id, () =>
                        api(`/stores/${storeId}/locations/${l.id}/default`, { body: {} }),
                      )
                    }
                  >
                    Make default
                  </Button>
                )}
                {!l.isDefault && (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={busyId === l.id}
                    onClick={() =>
                      void mutate(l.id, () =>
                        api(`/stores/${storeId}/locations/${l.id}`, {
                          method: "PATCH",
                          body: { isActive: !l.isActive },
                        }),
                      )
                    }
                  >
                    {l.isActive ? "Deactivate" : "Activate"}
                  </Button>
                )}
                {!l.isDefault && (
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(l)}>
                    Delete
                  </Button>
                )}
              </div>
            ),
          } satisfies DataGridColumn<LocationSummary>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Warehouses, shops and storage rooms that hold stock. One location is the default for new
          stock.
        </p>
        {canWrite && <Button onClick={() => setEditing({ kind: "new" })}>Add location</Button>}
      </div>
      {(error ?? action.error) && <Alert variant="error">{error ?? action.error}</Alert>}
      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(l) => l.id}
        loading={loading}
        empty={{
          title: "No locations yet",
          description: "Create a warehouse or shop to start tracking stock.",
          action: canWrite ? (
            <Button onClick={() => setEditing({ kind: "new" })}>Add your first location</Button>
          ) : undefined,
        }}
      />
      <LocationDialog
        storeId={storeId}
        editing={editing}
        isFirst={rows.length === 0}
        onClose={() => setEditing(null)}
        onSaved={() => void load()}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name ?? "location"}?`}
        description="Only empty locations can be deleted. Past movements keep their history."
        confirmLabel="Delete"
        destructive
        pending={busyId === deleting?.id}
        onConfirm={async () => {
          if (!deleting) return;
          await mutate(deleting.id, () =>
            api(`/stores/${storeId}/locations/${deleting.id}`, { method: "DELETE" }),
          );
          setDeleting(null);
        }}
      />
    </div>
  );
}

function LocationDialog({
  storeId,
  editing,
  isFirst,
  onClose,
  onSaved,
}: {
  storeId: string;
  editing: Editing;
  isFirst: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const submit = useSubmit();
  const { reset } = submit;
  const [name, setName] = useState("");
  const [type, setType] = useState<LocationType>("warehouse");
  const [address, setAddress] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isDefault, setIsDefault] = useState(false);
  const current = editing?.kind === "edit" ? editing.location : null;

  useEffect(() => {
    reset();
    setName(current?.name ?? "");
    setType(current?.type ?? "warehouse");
    setAddress(current?.address ?? "");
    setIsActive(current?.isActive ?? true);
    setIsDefault(current?.isDefault ?? isFirst);
  }, [current, isFirst, editing, reset]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = { name, type, address: address.trim() || null, isActive, isDefault };
    const res = await submit.run(() =>
      current
        ? api(`/stores/${storeId}/locations/${current.id}`, { method: "PATCH", body })
        : api(`/stores/${storeId}/locations`, { body }),
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
      title={current ? "Edit location" : "Add location"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button type="submit" form="location-form" loading={submit.pending}>
            {current ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <form id="location-form" onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        <FormField id="loc-name" label="Name" error={submit.fieldErrors.name}>
          <Input
            id="loc-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
            invalid={!!submit.fieldErrors.name}
            autoFocus
          />
        </FormField>
        <FormField id="loc-type" label="Type">
          <Select
            id="loc-type"
            value={type}
            onChange={(e) => setType(e.target.value as LocationType)}
          >
            {LOCATION_TYPES.map((t) => (
              <option key={t} value={t} className="capitalize">
                {t}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="loc-address" label="Address" error={submit.fieldErrors.address}>
          <Textarea
            id="loc-address"
            rows={2}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            maxLength={500}
          />
        </FormField>
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={isDefault}
              disabled={current?.isDefault ?? false}
              onChange={(e) => {
                setIsDefault(e.target.checked);
                if (e.target.checked) setIsActive(true);
              }}
            />
            Default location for new stock
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={isActive}
              disabled={isDefault}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Active
          </label>
          {submit.fieldErrors.isActive && (
            <p role="alert" className="text-xs text-destructive">
              {submit.fieldErrors.isActive}
            </p>
          )}
        </div>
      </form>
    </Dialog>
  );
}
