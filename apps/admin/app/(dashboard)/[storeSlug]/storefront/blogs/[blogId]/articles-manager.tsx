"use client";

import type { ArticleSummary } from "@ocean/types";
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

interface ArticleDetail extends ArticleSummary {
  bodyRich?: { html?: string } | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
}

const STATUS_VARIANT: Record<ArticleSummary["status"], "success" | "secondary" | "warning"> = {
  published: "success",
  draft: "secondary",
  archived: "warning",
};

export function ArticlesManager({
  storeId,
  blogId,
  canWrite,
}: {
  storeId: string;
  blogId: string;
  canWrite: boolean;
}) {
  const [rows, setRows] = useState<ArticleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [deleting, setDeleting] = useState<ArticleSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const action = useSubmit();

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ data: ArticleSummary[] }>(`/stores/${storeId}/blogs/${blogId}/articles`);
      setRows(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [storeId, blogId]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: DataGridColumn<ArticleSummary>[] = [
    {
      key: "title",
      header: "Article",
      cell: (a) => (
        <button className="font-medium hover:underline" onClick={() => setEditingId(a.id)}>
          {a.title}
        </button>
      ),
    },
    { key: "handle", header: "Handle", cell: (a) => <span className="text-muted-foreground">/{a.handle}</span> },
    { key: "authorName", header: "Author", cell: (a) => a.authorName ?? "—" },
    {
      key: "status",
      header: "Status",
      cell: (a) => <Badge variant={STATUS_VARIANT[a.status]}>{a.status}</Badge>,
    },
    {
      key: "publishedAt",
      header: "Published",
      cell: (a) => (a.publishedAt ? new Date(a.publishedAt).toLocaleDateString() : "—"),
    },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "",
            className: "text-right",
            cell: (a: ArticleSummary) => (
              <div className="flex flex-wrap justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditingId(a.id)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(a)}>
                  Delete
                </Button>
              </div>
            ),
          } satisfies DataGridColumn<ArticleSummary>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Dated, authored articles published to this blog.</p>
        {canWrite && <Button onClick={() => setEditingId("new")}>Add article</Button>}
      </div>
      {(error ?? action.error) && <Alert variant="error">{error ?? action.error}</Alert>}
      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(a) => a.id}
        loading={loading}
        empty={{
          title: "No articles yet",
          description: "Add one to publish it to this blog.",
          action: canWrite ? <Button onClick={() => setEditingId("new")}>Add your first article</Button> : undefined,
        }}
      />
      <ArticleDialog
        storeId={storeId}
        blogId={blogId}
        editingId={editingId}
        canWrite={canWrite}
        onClose={() => setEditingId(null)}
        onSaved={() => void load()}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.title ?? "this article"}?`}
        destructive
        pending={busyId === deleting?.id}
        onConfirm={async () => {
          if (!deleting) return;
          setBusyId(deleting.id);
          const ok = await action.run(() =>
            api(`/stores/${storeId}/blogs/${blogId}/articles/${deleting.id}`, { method: "DELETE" }),
          );
          setBusyId(null);
          if (ok !== undefined) await load();
          setDeleting(null);
        }}
      />
    </div>
  );
}

function ArticleDialog({
  storeId,
  blogId,
  editingId,
  canWrite,
  onClose,
  onSaved,
}: {
  storeId: string;
  blogId: string;
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
  const [excerpt, setExcerpt] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [featuredImageUrl, setFeaturedImageUrl] = useState("");
  const [featuredImageAlt, setFeaturedImageAlt] = useState("");
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState<ArticleSummary["status"]>("draft");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const isNew = editingId === "new";

  useEffect(() => {
    if (editingId === null) return;
    reset();
    setTitle("");
    setHandle("");
    setHtml("");
    setExcerpt("");
    setAuthorName("");
    setFeaturedImageUrl("");
    setFeaturedImageAlt("");
    setTags("");
    setStatus("draft");
    setSeoTitle("");
    setSeoDescription("");
    if (editingId !== "new") {
      setLoadingDetail(true);
      api<{ data: ArticleDetail }>(`/stores/${storeId}/blogs/${blogId}/articles/${editingId}`)
        .then(({ data: detail }) => {
          setTitle(detail.title);
          setHandle(detail.handle);
          setHtml(detail.bodyRich?.html ?? "");
          setExcerpt(detail.excerpt ?? "");
          setAuthorName(detail.authorName ?? "");
          setFeaturedImageUrl(detail.featuredImageUrl ?? "");
          setFeaturedImageAlt(detail.featuredImageAlt ?? "");
          setTags(detail.tags.join(", "));
          setStatus(detail.status);
          setSeoTitle(detail.seoTitle ?? "");
          setSeoDescription(detail.seoDescription ?? "");
        })
        .catch(() => reset())
        .finally(() => setLoadingDetail(false));
    }
  }, [editingId, storeId, blogId, reset]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = {
      title,
      handle,
      bodyRich: { html },
      excerpt: excerpt || null,
      authorName: authorName || null,
      featuredImageUrl: featuredImageUrl || null,
      featuredImageAlt: featuredImageAlt || null,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      status,
      seoTitle: seoTitle || null,
      seoDescription: seoDescription || null,
    };
    const res = await submit.run(() =>
      isNew
        ? api(`/stores/${storeId}/blogs/${blogId}/articles`, { body })
        : api(`/stores/${storeId}/blogs/${blogId}/articles/${editingId}`, { method: "PATCH", body }),
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
      title={isNew ? "Add article" : "Edit article"}
      className="max-w-2xl"
      footer={
        canWrite ? (
          <>
            <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
              Cancel
            </Button>
            <Button type="submit" form="article-form" loading={submit.pending} disabled={loadingDetail}>
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
      <form
        id="article-form"
        onSubmit={(e) => void onSubmit(e)}
        className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1"
      >
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        <FormField id="article-title" label="Title" error={submit.fieldErrors.title}>
          <Input id="article-title" value={title} onChange={(e) => setTitle(e.target.value)} required disabled={!canWrite} autoFocus />
        </FormField>
        <FormField id="article-handle" label="Handle" error={submit.fieldErrors.handle}>
          <Input id="article-handle" value={handle} onChange={(e) => setHandle(e.target.value)} required disabled={!canWrite} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField id="article-author" label="Author">
            <Input id="article-author" value={authorName} onChange={(e) => setAuthorName(e.target.value)} disabled={!canWrite} />
          </FormField>
          <FormField id="article-status" label="Status">
            <Select
              id="article-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ArticleSummary["status"])}
              disabled={!canWrite}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </Select>
          </FormField>
        </div>
        <FormField id="article-excerpt" label="Excerpt">
          <Textarea id="article-excerpt" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={2} disabled={!canWrite} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField id="article-image-url" label="Featured image URL">
            <Input
              id="article-image-url"
              value={featuredImageUrl}
              onChange={(e) => setFeaturedImageUrl(e.target.value)}
              disabled={!canWrite}
            />
          </FormField>
          <FormField id="article-image-alt" label="Featured image alt text">
            <Input
              id="article-image-alt"
              value={featuredImageAlt}
              onChange={(e) => setFeaturedImageAlt(e.target.value)}
              disabled={!canWrite}
            />
          </FormField>
        </div>
        <FormField id="article-tags" label="Tags (comma separated)">
          <Input id="article-tags" value={tags} onChange={(e) => setTags(e.target.value)} disabled={!canWrite} />
        </FormField>
        <FormField id="article-body" label="Content (HTML)">
          <Textarea id="article-body" value={html} onChange={(e) => setHtml(e.target.value)} rows={8} disabled={!canWrite} />
        </FormField>
        <FormField id="article-seo-title" label="SEO title">
          <Input id="article-seo-title" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} disabled={!canWrite} />
        </FormField>
        <FormField id="article-seo-description" label="SEO description">
          <Textarea
            id="article-seo-description"
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
