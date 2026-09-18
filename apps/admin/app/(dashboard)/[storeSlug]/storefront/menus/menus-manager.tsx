"use client";

import type { MenuSummary } from "@ocean/types";
import { Alert, Button, Card, CardContent, ConfirmDialog, Dialog, FormField, Input, Skeleton } from "@ocean/ui";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { api, errorMessage } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

export function MenusManager({ storeId, canWrite }: { storeId: string; canWrite: boolean }) {
  const [rows, setRows] = useState<MenuSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<MenuSummary | "new" | null>(null);
  const [deleting, setDeleting] = useState<MenuSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const action = useSubmit();

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ data: MenuSummary[] }>(`/stores/${storeId}/menus`);
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Navigation menus for the storefront header and footer.</p>
        {canWrite && <Button onClick={() => setEditing("new")}>Add menu</Button>}
      </div>
      {(error ?? action.error) && <Alert variant="error">{error ?? action.error}</Alert>}
      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No menus yet.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((m) => (
            <Card key={m.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <button className="font-medium hover:underline" onClick={() => setEditing(m)}>
                    {m.title}
                  </button>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">/{m.handle}</span>
                    {canWrite && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(m)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleting(m)}>
                          Delete
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {m.items && m.items.length > 0 ? (
                  <ul className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
                    {m.items.map((item) => (
                      <li key={item.id}>
                        {item.label} {item.url && <span className="text-xs">→ {item.url}</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">No items.</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <MenuDialog storeId={storeId} editing={editing} onClose={() => setEditing(null)} onSaved={() => void load()} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.title ?? "this menu"}?`}
        destructive
        pending={busyId === deleting?.id}
        onConfirm={async () => {
          if (!deleting) return;
          setBusyId(deleting.id);
          const ok = await action.run(() => api(`/stores/${storeId}/menus/${deleting.id}`, { method: "DELETE" }));
          setBusyId(null);
          if (ok !== undefined) await load();
          setDeleting(null);
        }}
      />
    </div>
  );
}

function MenuDialog({
  storeId,
  editing,
  onClose,
  onSaved,
}: {
  storeId: string;
  editing: MenuSummary | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const submit = useSubmit();
  const { reset } = submit;
  const [title, setTitle] = useState("");
  const [handle, setHandle] = useState("");
  const [items, setItems] = useState<{ label: string; url: string }[]>([{ label: "", url: "" }]);
  const isNew = editing === "new";
  const current = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    if (editing === null) return;
    reset();
    setTitle(current?.title ?? "");
    setHandle(current?.handle ?? "");
    setItems(
      current?.items && current.items.length > 0
        ? current.items.map((i) => ({ label: i.label, url: i.url ?? "" }))
        : [{ label: "", url: "" }],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `current` is derived from `editing`
  }, [editing, reset]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const cleanItems = items
      .filter((i) => i.label.trim())
      .map((i, idx) => ({ label: i.label.trim(), url: i.url.trim() || null, position: idx }));
    const res = await submit.run(() =>
      isNew
        ? api(`/stores/${storeId}/menus`, { body: { title, handle, items: cleanItems } })
        : api(`/stores/${storeId}/menus/${current?.id}`, { method: "PATCH", body: { title, handle, items: cleanItems } }),
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
      title={isNew ? "Add menu" : "Edit menu"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button type="submit" form="menu-form" loading={submit.pending}>
            {isNew ? "Create" : "Save"}
          </Button>
        </>
      }
    >
      <form id="menu-form" onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        <FormField id="menu-title" label="Title" error={submit.fieldErrors.title}>
          <Input id="menu-title" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
        </FormField>
        <FormField id="menu-handle" label="Handle" error={submit.fieldErrors.handle}>
          <Input id="menu-handle" value={handle} onChange={(e) => setHandle(e.target.value)} required />
        </FormField>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Items</span>
          {items.map((item, idx) => (
            <div key={idx} className="flex gap-2">
              <Input
                placeholder="Label"
                value={item.label}
                onChange={(e) => {
                  const label = e.target.value;
                  setItems(items.map((it, i) => (i === idx ? { ...it, label } : it)));
                }}
              />
              <Input
                placeholder="URL"
                value={item.url}
                onChange={(e) => {
                  const url = e.target.value;
                  setItems(items.map((it, i) => (i === idx ? { ...it, url } : it)));
                }}
              />
              <Button type="button" size="sm" variant="ghost" onClick={() => setItems(items.filter((_, i) => i !== idx))}>
                ✕
              </Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="ghost" onClick={() => setItems([...items, { label: "", url: "" }])}>
            Add item
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
