"use client";

import type { MediaSummary, Paginated } from "@ocean/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  EmptyState,
  Input,
} from "@ocean/ui";
import { useCallback, useEffect, useRef, useState } from "react";

import { api, errorMessage } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function MediaLibrary({ storeId, canWrite }: { storeId: string; canWrite: boolean }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<MediaSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<MediaSummary | null>(null);

  const load = useCallback(
    async (after: string | null, append: boolean) => {
      setLoading(!append);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: "40" });
        if (q.trim()) params.set("q", q.trim());
        if (after) params.set("cursor", after);
        const res = await api<Paginated<MediaSummary>>(`/stores/${storeId}/media?${params}`);
        setRows((prev) => (append ? [...prev, ...res.data] : res.data));
        setCursor(res.pageInfo.endCursor);
        setHasNext(res.pageInfo.hasNextPage);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [storeId, q],
  );

  useEffect(() => {
    const handle = setTimeout(() => void load(null, false), q ? 250 : 0);
    return () => clearTimeout(handle);
  }, [load, q]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`${API}/admin/v1/stores/${storeId}/media`, {
          method: "POST",
          body: form,
          credentials: "include",
        });
        const json = (await res.json()) as { error?: { message: string } };
        if (!res.ok) throw new Error(json.error?.message ?? "Upload failed");
      }
      await load(null, false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function remove() {
    if (!deleting) return;
    try {
      await api(`/stores/${storeId}/media/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      await load(null, false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function saveAlt(m: MediaSummary, alt: string) {
    if ((m.alt ?? "") === alt) return;
    try {
      await api(`/stores/${storeId}/media/${m.id}`, {
        method: "PATCH",
        body: { alt: alt || null },
      });
      setRows((prev) => prev.map((r) => (r.id === m.id ? { ...r, alt: alt || null } : r)));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Files</h2>
          <p className="text-sm text-muted-foreground">
            Images, videos and documents used across products, collections and content.
          </p>
        </div>
        {canWrite && (
          <label className="inline-flex h-9 cursor-pointer items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            {uploading ? "Uploading…" : "Upload files"}
            <input
              ref={fileInput}
              type="file"
              multiple
              className="sr-only"
              accept="image/*,video/mp4,video/webm,application/pdf"
              onChange={(e) => void upload(e.target.files)}
              disabled={uploading}
            />
          </label>
        )}
      </div>
      <Input
        placeholder="Search by file name or alt text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-md"
        aria-label="Search files"
      />
      {error && <Alert variant="error">{error}</Alert>}

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <EmptyState
              title={q ? "No files match" : "No files yet"}
              description={
                q ? "Try another search." : "Upload images to use them on products and collections."
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {rows.map((m) => (
                <div key={m.id} className="flex flex-col gap-2 rounded-md border p-2 text-xs">
                  <div className="flex h-28 items-center justify-center overflow-hidden rounded bg-muted">
                    {m.kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.url} alt={m.alt ?? ""} className="h-full w-full object-cover" />
                    ) : (
                      <span className="uppercase text-muted-foreground">{m.kind}</span>
                    )}
                  </div>
                  <div className="truncate font-medium" title={m.originalFilename}>
                    {m.originalFilename}
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>
                      {Math.round(m.bytes / 1024)} KB{m.width ? ` · ${m.width}×${m.height}` : ""}
                    </span>
                    <Badge variant="outline">
                      {m.usageCount} use{m.usageCount === 1 ? "" : "s"}
                    </Badge>
                  </div>
                  {canWrite ? (
                    <Input
                      aria-label="Alt text"
                      placeholder="Alt text"
                      defaultValue={m.alt ?? ""}
                      onBlur={(e) => void saveAlt(m, e.target.value)}
                      className="h-7 text-xs"
                    />
                  ) : (
                    <div className="truncate text-muted-foreground">{m.alt ?? "No alt text"}</div>
                  )}
                  {canWrite && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7"
                      onClick={() => setDeleting(m)}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
          {hasNext && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" size="sm" onClick={() => void load(cursor, true)}>
                Load more
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title={`Delete "${deleting?.originalFilename}"?`}
        description={
          deleting?.usageCount
            ? `This file is used in ${deleting.usageCount} place(s); it will be detached everywhere.`
            : "The file is removed from storage."
        }
        confirmLabel="Delete file"
        destructive
      />
    </div>
  );
}
