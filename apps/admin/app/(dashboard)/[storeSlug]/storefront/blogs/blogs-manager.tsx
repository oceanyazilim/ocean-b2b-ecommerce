"use client";

import type { BlogSummary } from "@ocean/types";
import {
  Alert,
  Button,
  ConfirmDialog,
  DataGrid,
  Dialog,
  FormField,
  Input,
  Textarea,
  type DataGridColumn,
} from "@ocean/ui";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { api, errorMessage } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

interface BlogDetail extends BlogSummary {
  seoTitle?: string | null;
  seoDescription?: string | null;
}

export function BlogsManager({
  storeId,
  storeSlug,
  canWrite,
}: {
  storeId: string;
  storeSlug: string;
  canWrite: boolean;
}) {
  const [rows, setRows] = useState<BlogSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [deleting, setDeleting] = useState<BlogSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const action = useSubmit();

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ data: BlogSummary[] }>(`/stores/${storeId}/blogs`);
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

  const columns: DataGridColumn<BlogSummary>[] = [
    {
      key: "title",
      header: "Blog",
      cell: (b) => (
        <Link className="font-medium hover:underline" href={`/${storeSlug}/storefront/blogs/${b.id}`}>
          {b.title}
        </Link>
      ),
    },
    { key: "handle", header: "Handle", cell: (b) => <span className="text-muted-foreground">/blogs/{b.handle}</span> },
    { key: "articleCount", header: "Articles", cell: (b) => <span>{b.articleCount}</span> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (b: BlogSummary) => (
        <div className="flex flex-wrap items-center justify-end gap-1">
          <Link
            href={`/${storeSlug}/storefront/blogs/${b.id}`}
            className="inline-flex h-8 items-center rounded-md px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
          >
            Manage articles
          </Link>
          {canWrite && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditingId(b.id)}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDeleting(b)}>
                Delete
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Named collections of dated, authored articles.</p>
        {canWrite && <Button onClick={() => setEditingId("new")}>Add blog</Button>}
      </div>
      {(error ?? action.error) && <Alert variant="error">{error ?? action.error}</Alert>}
      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(b) => b.id}
        loading={loading}
        empty={{
          title: "No blogs yet",
          description: "Add one to start publishing articles on the storefront.",
          action: canWrite ? <Button onClick={() => setEditingId("new")}>Add your first blog</Button> : undefined,
        }}
      />
      <BlogDialog
        storeId={storeId}
        editingId={editingId}
        canWrite={canWrite}
        onClose={() => setEditingId(null)}
        onSaved={() => void load()}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.title ?? "this blog"}?`}
        description="This also deletes every article in this blog. This cannot be undone."
        destructive
        pending={busyId === deleting?.id}
        onConfirm={async () => {
          if (!deleting) return;
          setBusyId(deleting.id);
          const ok = await action.run(() => api(`/stores/${storeId}/blogs/${deleting.id}`, { method: "DELETE" }));
          setBusyId(null);
          if (ok !== undefined) await load();
          setDeleting(null);
        }}
      />
    </div>
  );
}

function BlogDialog({
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
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const isNew = editingId === "new";

  useEffect(() => {
    if (editingId === null) return;
    reset();
    setTitle("");
    setHandle("");
    setSeoTitle("");
    setSeoDescription("");
    if (editingId !== "new") {
      setLoadingDetail(true);
      api<{ data: BlogDetail }>(`/stores/${storeId}/blogs/${editingId}`)
        .then(({ data: detail }) => {
          setTitle(detail.title);
          setHandle(detail.handle);
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
      seoTitle: seoTitle || null,
      seoDescription: seoDescription || null,
    };
    const res = await submit.run(() =>
      isNew
        ? api(`/stores/${storeId}/blogs`, { body })
        : api(`/stores/${storeId}/blogs/${editingId}`, { method: "PATCH", body }),
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
      title={isNew ? "Add blog" : "Edit blog"}
      footer={
        canWrite ? (
          <>
            <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
              Cancel
            </Button>
            <Button type="submit" form="blog-form" loading={submit.pending} disabled={loadingDetail}>
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
      <form id="blog-form" onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        <FormField id="blog-title" label="Title" error={submit.fieldErrors.title}>
          <Input id="blog-title" value={title} onChange={(e) => setTitle(e.target.value)} required disabled={!canWrite} autoFocus />
        </FormField>
        <FormField id="blog-handle" label="Handle" error={submit.fieldErrors.handle}>
          <Input id="blog-handle" value={handle} onChange={(e) => setHandle(e.target.value)} required disabled={!canWrite} />
        </FormField>
        <FormField id="blog-seo-title" label="SEO title">
          <Input id="blog-seo-title" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} disabled={!canWrite} />
        </FormField>
        <FormField id="blog-seo-description" label="SEO description">
          <Textarea
            id="blog-seo-description"
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
