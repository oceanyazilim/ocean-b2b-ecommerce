"use client";

import type { CollectionSummary, Paginated } from "@ocean/types";
import { Alert, Badge, Button, DataGrid, Input, type DataGridColumn } from "@ocean/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { api, errorMessage } from "@/lib/api";

export function CollectionsList({
  storeId,
  storeSlug,
  canWrite,
}: {
  storeId: string;
  storeSlug: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<CollectionSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (after: string | null, append: boolean) => {
      setLoading(!append);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: "25" });
        if (q.trim()) params.set("q", q.trim());
        if (after) params.set("cursor", after);
        const res = await api<Paginated<CollectionSummary>>(
          `/stores/${storeId}/collections?${params}`,
        );
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

  const columns: DataGridColumn<CollectionSummary>[] = [
    {
      key: "title",
      header: "Collection",
      cell: (c) => (
        <div className="flex items-center gap-3">
          {c.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={c.image.url}
              alt={c.image.alt ?? ""}
              className="h-9 w-9 rounded border object-cover"
            />
          ) : (
            <div className="h-9 w-9 rounded border bg-muted" aria-hidden />
          )}
          <div>
            <Link
              href={`/${storeSlug}/collections/${c.id}`}
              className="font-medium hover:underline"
            >
              {c.title}
            </Link>
            <div className="text-xs text-muted-foreground">/collections/{c.handle}</div>
          </div>
        </div>
      ),
    },
    { key: "type", header: "Type", cell: (c) => <Badge variant="outline">{c.type}</Badge> },
    {
      key: "count",
      header: "Products",
      cell: (c) => <span className="tabular-nums">{c.productCount}</span>,
    },
    {
      key: "published",
      header: "Visibility",
      cell: (c) => (
        <Badge variant={c.published ? "success" : "secondary"}>
          {c.published ? "Published" : "Hidden"}
        </Badge>
      ),
    },
    {
      key: "updated",
      header: "Updated",
      cell: (c) => (
        <span className="text-muted-foreground">{new Date(c.updatedAt).toLocaleDateString()}</span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Collections</h1>
          <p className="text-sm text-muted-foreground">
            Group products by hand or with rules that keep themselves up to date.
          </p>
        </div>
        {canWrite && (
          <Link href={`/${storeSlug}/collections/new`}>
            <Button>Create collection</Button>
          </Link>
        )}
      </div>
      <Input
        placeholder="Search collections"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-md"
        aria-label="Search collections"
      />
      {error && <Alert variant="error">{error}</Alert>}
      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(c) => c.id}
        loading={loading}
        onRowClick={(c) => router.push(`/${storeSlug}/collections/${c.id}`)}
        empty={{
          title: q ? "No collections match" : "No collections yet",
          description: q
            ? "Try a different search."
            : "Collections power navigation, merchandising and B2B catalogs.",
          action:
            canWrite && !q ? (
              <Link href={`/${storeSlug}/collections/new`}>
                <Button>Create your first collection</Button>
              </Link>
            ) : undefined,
        }}
        pageInfo={{ hasNextPage: hasNext, onNext: () => void load(cursor, true) }}
      />
    </div>
  );
}
