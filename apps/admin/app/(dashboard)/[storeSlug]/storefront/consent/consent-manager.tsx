"use client";

import { CONSENT_CATEGORIES, type ConsentRecordSummary, type TrackingScriptSummary } from "@ocean/types";
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

const CATEGORY_LABEL: Record<string, string> = {
  necessary: "Necessary",
  functional: "Functional",
  analytics: "Analytics",
  marketing: "Marketing",
};

type Editing = { kind: "new" } | { kind: "edit"; script: TrackingScriptSummary } | null;

// L6 Global Localization (spec section 47): cookie/privacy consent settings — the merchant's
// tracking-script inventory (each tagged with the cookie category it belongs to) plus a read-only
// view of the consent log real visitors have generated. See ConsentService's module comment for
// why this stops short of a dynamic script-injection engine.
export function ConsentManager({ storeId, canWrite }: { storeId: string; canWrite: boolean }) {
  const [scripts, setScripts] = useState<TrackingScriptSummary[]>([]);
  const [records, setRecords] = useState<ConsentRecordSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<TrackingScriptSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const action = useSubmit();

  const load = useCallback(async () => {
    setError(null);
    try {
      const [scriptsRes, recordsRes] = await Promise.all([
        api<{ data: TrackingScriptSummary[] }>(`/stores/${storeId}/consent/scripts`),
        api<{ data: ConsentRecordSummary[] }>(`/stores/${storeId}/consent/records?limit=20`),
      ]);
      setScripts(scriptsRes.data);
      setRecords(recordsRes.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: DataGridColumn<TrackingScriptSummary>[] = [
    {
      key: "name",
      header: "Script",
      cell: (s) => (
        <button className="font-medium hover:underline" onClick={() => setEditing({ kind: "edit", script: s })}>
          {s.name}
        </button>
      ),
    },
    { key: "provider", header: "Provider", cell: (s) => s.provider ?? <span className="text-muted-foreground">—</span> },
    { key: "category", header: "Category", cell: (s) => <Badge variant="secondary">{CATEGORY_LABEL[s.category] ?? s.category}</Badge> },
    {
      key: "status",
      header: "Status",
      cell: (s) => <Badge variant={s.isEnabled ? "success" : "outline"}>{s.isEnabled ? "Enabled" : "Disabled"}</Badge>,
    },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "",
            className: "text-right",
            cell: (s: TrackingScriptSummary) => (
              <div className="flex flex-wrap justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing({ kind: "edit", script: s })}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(s)}>
                  Delete
                </Button>
              </div>
            ),
          } satisfies DataGridColumn<TrackingScriptSummary>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Third-party scripts</p>
            <p className="text-sm text-muted-foreground">
              Track the analytics/ads/chat scripts this store uses and which cookie category each
              belongs to.
            </p>
          </div>
          {canWrite && <Button onClick={() => setEditing({ kind: "new" })}>Add script</Button>}
        </div>
        {(error ?? action.error) && <Alert variant="error">{error ?? action.error}</Alert>}
        <DataGrid
          columns={columns}
          rows={scripts}
          rowKey={(s) => s.id}
          loading={loading}
          empty={{
            title: "No tracking scripts yet",
            description: "Add one so its consent category is tracked alongside the banner.",
            action: canWrite ? <Button onClick={() => setEditing({ kind: "new" })}>Add your first script</Button> : undefined,
          }}
        />
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium">Recent consent log</p>
          <p className="text-sm text-muted-foreground">The most recent visitor consent decisions recorded on the storefront.</p>
        </div>
        {records.length === 0 && !loading ? (
          <p className="text-sm text-muted-foreground">No consent decisions have been logged yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Country</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Functional</th>
                <th className="px-3 py-2 font-medium">Analytics</th>
                <th className="px-3 py-2 font-medium">Marketing</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-b last:border-b-0">
                  <td className="px-3 py-2">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2">{r.countryCode ?? "—"}</td>
                  <td className="px-3 py-2">{r.source}</td>
                  <td className="px-3 py-2">{r.functional ? "Granted" : "Denied"}</td>
                  <td className="px-3 py-2">{r.analytics ? "Granted" : "Denied"}</td>
                  <td className="px-3 py-2">{r.marketing ? "Granted" : "Denied"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <TrackingScriptDialog
        storeId={storeId}
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => void load()}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name ?? "this script"}?`}
        destructive
        pending={busyId === deleting?.id}
        onConfirm={async () => {
          if (!deleting) return;
          setBusyId(deleting.id);
          const ok = await action.run(() => api(`/stores/${storeId}/consent/scripts/${deleting.id}`, { method: "DELETE" }));
          setBusyId(null);
          if (ok !== undefined) await load();
          setDeleting(null);
        }}
      />
    </div>
  );
}

function TrackingScriptDialog({
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
  const [provider, setProvider] = useState("");
  const [category, setCategory] = useState<(typeof CONSENT_CATEGORIES)[number]>("analytics");
  const [snippet, setSnippet] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);
  const current = editing?.kind === "edit" ? editing.script : null;

  useEffect(() => {
    reset();
    setName(current?.name ?? "");
    setProvider(current?.provider ?? "");
    setCategory(current?.category ?? "analytics");
    setSnippet(current?.snippet ?? "");
    setIsEnabled(current?.isEnabled ?? true);
  }, [current, editing, reset]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = {
      name,
      provider: provider || null,
      category,
      snippet: snippet || null,
      isEnabled,
    };
    const res = await submit.run(() =>
      current
        ? api(`/stores/${storeId}/consent/scripts/${current.id}`, { method: "PATCH", body })
        : api(`/stores/${storeId}/consent/scripts`, { body }),
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
      title={current ? "Edit tracking script" : "Add tracking script"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button type="submit" form="tracking-script-form" loading={submit.pending}>
            {current ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <form id="tracking-script-form" onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        <FormField id="script-name" label="Name" error={submit.fieldErrors.name}>
          <Input id="script-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={160} autoFocus />
        </FormField>
        <FormField id="script-provider" label="Provider" error={submit.fieldErrors.provider}>
          <Input id="script-provider" value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Google Analytics" />
        </FormField>
        <FormField id="script-category" label="Cookie category" error={submit.fieldErrors.category}>
          <Select id="script-category" value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
            {CONSENT_CATEGORIES.filter((c) => c !== "necessary").map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="script-snippet" label="Reference id / snippet" hint="Stored for reference only — never executed by Ocean.">
          <Textarea id="script-snippet" value={snippet} onChange={(e) => setSnippet(e.target.value)} rows={3} />
        </FormField>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={isEnabled} onChange={(e) => setIsEnabled(e.target.checked)} />
          Enabled
        </label>
      </form>
    </Dialog>
  );
}
