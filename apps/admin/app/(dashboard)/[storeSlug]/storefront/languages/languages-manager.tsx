"use client";

import type { StoreLanguageSummary } from "@ocean/types";
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

// Settings -> Languages (spec section 4). Every language a merchant adds is independently
// publishable — a draft language is only visible/editable here and in Localization ->
// Translations, never on the live storefront, until it's explicitly published.
export function LanguagesManager({ storeId, canWrite }: { storeId: string; canWrite: boolean }) {
  const [rows, setRows] = useState<StoreLanguageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<StoreLanguageSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const action = useSubmit();

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ data: StoreLanguageSummary[] }>(`/stores/${storeId}/languages`);
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

  async function togglePublished(row: StoreLanguageSummary) {
    setBusyId(row.id);
    const ok = await action.run(() =>
      api(`/stores/${storeId}/languages/${row.id}`, { method: "PATCH", body: { isPublished: !row.isPublished } }),
    );
    setBusyId(null);
    if (ok !== undefined) await load();
  }

  async function makeDefault(row: StoreLanguageSummary) {
    setBusyId(row.id);
    const ok = await action.run(() =>
      api(`/stores/${storeId}/languages/${row.id}`, { method: "PATCH", body: { isDefault: true } }),
    );
    setBusyId(null);
    if (ok !== undefined) await load();
  }

  const columns: DataGridColumn<StoreLanguageSummary>[] = [
    {
      key: "locale",
      header: "Language",
      cell: (l) => (
        <span className="font-medium">
          {l.locale} {l.isDefault && <Badge variant="secondary">Default</Badge>}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (l) => <Badge variant={l.isPublished ? "success" : "outline"}>{l.isPublished ? "Published" : "Draft"}</Badge>,
    },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "",
            className: "text-right",
            cell: (l: StoreLanguageSummary) => (
              <div className="flex flex-wrap justify-end gap-1">
                {!l.isDefault && (
                  <Button size="sm" variant="ghost" loading={busyId === l.id} onClick={() => void makeDefault(l)}>
                    Make default
                  </Button>
                )}
                <Button size="sm" variant="ghost" loading={busyId === l.id} onClick={() => void togglePublished(l)}>
                  {l.isPublished ? "Unpublish" : "Publish"}
                </Button>
                {!l.isDefault && (
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(l)}>
                    Delete
                  </Button>
                )}
              </div>
            ),
          } satisfies DataGridColumn<StoreLanguageSummary>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Storefront languages buyers can browse in. Use a locale code like en-US, tr-TR, de-DE, or ar-SA — any
          language can be added, there is no fixed list.
        </p>
        {canWrite && <Button onClick={() => setAdding(true)}>Add language</Button>}
      </div>
      {(error ?? action.error) && <Alert variant="error">{error ?? action.error}</Alert>}
      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(l) => l.id}
        loading={loading}
        empty={{
          title: "No languages yet",
          description: "Add your store's first storefront language.",
          action: canWrite ? <Button onClick={() => setAdding(true)}>Add your first language</Button> : undefined,
        }}
      />
      <AddLanguageDialog
        storeId={storeId}
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={() => void load()}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.locale ?? "this language"}?`}
        destructive
        pending={busyId === deleting?.id}
        onConfirm={async () => {
          if (!deleting) return;
          setBusyId(deleting.id);
          const ok = await action.run(() => api(`/stores/${storeId}/languages/${deleting.id}`, { method: "DELETE" }));
          setBusyId(null);
          if (ok !== undefined) await load();
          setDeleting(null);
        }}
      />
    </div>
  );
}

function AddLanguageDialog({
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
  const [locale, setLocale] = useState("");
  const [isPublished, setIsPublished] = useState(false);

  useEffect(() => {
    if (open) {
      reset();
      setLocale("");
      setIsPublished(false);
    }
  }, [open, reset]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const res = await submit.run(() =>
      api(`/stores/${storeId}/languages`, { body: { locale: locale.trim(), isDefault: false, isPublished } }),
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
      title="Add language"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button type="submit" form="language-form" loading={submit.pending}>
            Add
          </Button>
        </>
      }
    >
      <form id="language-form" onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        <FormField id="language-locale" label="Locale code" error={submit.fieldErrors.locale}>
          <Input
            id="language-locale"
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            required
            placeholder="de-DE"
            autoFocus
          />
        </FormField>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
          Publish immediately
        </label>
      </form>
    </Dialog>
  );
}
