"use client";

import type { PageSummary } from "@ocean/types";
import {
  Alert,
  Badge,
  Button,
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

interface PageDetail extends PageSummary {
  bodyRich?: { html?: string } | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
}

const STATUS_VARIANT: Record<PageSummary["status"], "success" | "secondary" | "warning"> = {
  published: "success",
  draft: "secondary",
  archived: "warning",
};

export function PagesManager({ storeId, canWrite }: { storeId: string; canWrite: boolean }) {
  const [rows, setRows] = useState<PageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [deleting, setDeleting] = useState<PageSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const action = useSubmit();

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ data: PageSummary[] }>(`/stores/${storeId}/pages`);
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

  const columns: DataGridColumn<PageSummary>[] = [
    {
      key: "title",
      header: "Page",
      cell: (p) => (
        <button className="font-medium hover:underline" onClick={() => setEditingId(p.id)}>
          {p.title}
        </button>
      ),
    },
    { key: "handle", header: "Handle", cell: (p) => <span className="text-muted-foreground">/{p.handle}</span> },
    {
      key: "status",
      header: "Status",
      cell: (p) => <Badge variant={STATUS_VARIANT[p.status]}>{p.status}</Badge>,
    },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "",
            className: "text-right",
            cell: (p: PageSummary) => (
              <div className="flex flex-wrap justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditingId(p.id)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(p)}>
                  Delete
                </Button>
              </div>
            ),
          } satisfies DataGridColumn<PageSummary>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Standalone content pages, like About or Shipping policy.</p>
        {canWrite && <Button onClick={() => setEditingId("new")}>Add page</Button>}
      </div>
      {(error ?? action.error) && <Alert variant="error">{error ?? action.error}</Alert>}
      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(p) => p.id}
        loading={loading}
        empty={{
          title: "No pages yet",
          description: "Add one to publish standalone content on the storefront.",
          action: canWrite ? <Button onClick={() => setEditingId("new")}>Add your first page</Button> : undefined,
        }}
      />
      <PageDialog
        storeId={storeId}
        editingId={editingId}
        canWrite={canWrite}
        onClose={() => setEditingId(null)}
        onSaved={() => void load()}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.title ?? "this page"}?`}
        destructive
        pending={busyId === deleting?.id}
        onConfirm={async () => {
          if (!deleting) return;
          setBusyId(deleting.id);
          const ok = await action.run(() => api(`/stores/${storeId}/pages/${deleting.id}`, { method: "DELETE" }));
          setBusyId(null);
          if (ok !== undefined) await load();
          setDeleting(null);
        }}
      />
    </div>
  );
}

function PageDialog({
  storeId,
  editingId,
  canWrite,
  onClose,
  onSaved,
}: {
  storeId: string;
  editingId: string | "new" | null;
  canWrite: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const submit = useSubmit();
  const { reset } = submit;
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [title, setTitle] = useState("");
  const [handle, setHandle] = useState("");
  const [html, setHtml] = useState("");
  const [status, setStatus] = useState<PageSummary["status"]>("draft");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const isNew = editingId === "new";

  useEffect(() => {
    if (editingId === null) return;
    reset();
    setTitle("");
    setHandle("");
    setHtml("");
    setStatus("draft");
    setSeoTitle("");
    setSeoDescription("");
    if (editingId !== "new") {
      setLoadingDetail(true);
      api<{ data: PageDetail }>(`/stores/${storeId}/pages/${editingId}`)
        .then(({ data: detail }) => {
          setTitle(detail.title);
          setHandle(detail.handle);
          setHtml(detail.bodyRich?.html ?? "");
          setStatus(detail.status);
          setSeoTitle(detail.seoTitle ?? "");
          setSeoDescription(detail.seoDescription ?? "");
        })
        .catch(() => reset())
        .finally(() => setLoadingDetail(false));
    }
  }, [editingId, storeId, reset]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = {
      title,
      handle,
      bodyRich: { html },
      status,
      seoTitle: seoTitle || null,
      seoDescription: seoDescription || null,
    };
    const res = await submit.run(() =>
      isNew
        ? api(`/stores/${storeId}/pages`, { body })
        : api(`/stores/${storeId}/pages/${editingId}`, { method: "PATCH", body }),
    );
    if (res !== undefined) {
      onSaved();
      onClose();
    }
  }

  return (
    <Dialog
      open={editingId !== null}
      onClose={onClose}
      title={isNew ? "Add page" : "Edit page"}
      footer={
        canWrite ? (
          <>
            <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
              Cancel
            </Button>
            <Button type="submit" form="page-form" loading={submit.pending} disabled={loadingDetail}>
              {isNew ? "Create" : "Save"}
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      <form id="page-form" onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        <FormField id="page-title" label="Title" error={submit.fieldErrors.title}>
          <Input id="page-title" value={title} onChange={(e) => setTitle(e.target.value)} required disabled={!canWrite} autoFocus />
        </FormField>
        <FormField id="page-handle" label="Handle" error={submit.fieldErrors.handle}>
          <Input id="page-handle" value={handle} onChange={(e) => setHandle(e.target.value)} required disabled={!canWrite} />
        </FormField>
        <FormField id="page-status" label="Status">
          <Select
            id="page-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as PageSummary["status"])}
            disabled={!canWrite}
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </Select>
        </FormField>
        <FormField id="page-body" label="Content (HTML)">
          <Textarea id="page-body" value={html} onChange={(e) => setHtml(e.target.value)} rows={8} disabled={!canWrite} />
        </FormField>
        <FormField id="page-seo-title" label="SEO title">
          <Input id="page-seo-title" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} disabled={!canWrite} />
        </FormField>
        <FormField id="page-seo-description" label="SEO description">
          <Textarea
            id="page-seo-description"
            value={seoDescription}
            onChange={(e) => setSeoDescription(e.target.value)}
            rows={2}
            disabled={!canWrite}
          />
        </FormField>
      </form>
    </Dialog>
  );
}
