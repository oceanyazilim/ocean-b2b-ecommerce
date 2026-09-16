"use client";

import type { CatalogStatus, CatalogSummary, Paginated } from "@ocean/types";
import {
  Alert,
  Badge,
  Button,
  DataGrid,
  Dialog,
  FormField,
  Input,
  Tabs,
  Textarea,
  type DataGridColumn,
} from "@ocean/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { api, errorMessage } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

type View = "all" | CatalogStatus;

export const CATALOG_STATUS_BADGE: Record<CatalogStatus, "success" | "secondary" | "warning"> = {
  active: "success",
  draft: "secondary",
  archived: "warning",
};

export function CatalogsList({
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
  const [view, setView] = useState<View>("all");
  const [pages, setPages] = useState<CatalogSummary[][]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(
    async (after: string | null, append: boolean) => {
      setLoading(!append);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: "25" });
        if (q.trim()) params.set("q", q.trim());
        if (view !== "all") params.set("status", view);
        if (after) params.set("cursor", after);
        const res = await api<Paginated<CatalogSummary>>(`/stores/${storeId}/catalogs?${params}`);
        setPages((prev) => (append ? [...prev, res.data] : [res.data]));
        setCursor(res.pageInfo.endCursor);
        setHasNext(res.pageInfo.hasNextPage);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [storeId, q, view],
  );

  useEffect(() => {
    const handle = setTimeout(() => void load(null, false), q ? 250 : 0);
    return () => clearTimeout(handle);
  }, [load, q]);

  const rows = useMemo(() => pages.flat(), [pages]);

  const columns: DataGridColumn<CatalogSummary>[] = [
    {
      key: "name",
      header: "Catalog",
      cell: (c) => (
        <div>
          <Link href={`/${storeSlug}/catalogs/${c.id}`} className="font-medium hover:underline">
            {c.name}
          </Link>
          {c.description && <div className="text-xs text-muted-foreground">{c.description}</div>}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (c) => <Badge variant={CATALOG_STATUS_BADGE[c.status]}>{c.status}</Badge>,
    },
    {
      key: "products",
      header: "Products",
      className: "text-right",
      cell: (c) => <span className="tabular-nums">{c.productCount}</span>,
    },
    {
      key: "assignments",
      header: "Assigned to",
      className: "text-right",
      cell: (c) => <span className="tabular-nums">{c.assignmentCount}</span>,
    },
    {
      key: "updated",
      header: "Updated",
      cell: (c) => (
        <span className="text-muted-foreground">{new Date(c.updatedAt).toLocaleDateString()}</span>
      ),
    },
  ];

  const filtered = q.trim() !== "" || view !== "all";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Catalogs</h1>
          <p className="text-sm text-muted-foreground">
            Which products each company can see and buy. A company with an active catalog sees only
            what is in it.
          </p>
        </div>
        {canWrite && <Button onClick={() => setCreating(true)}>New catalog</Button>}
      </div>
      <Tabs
        aria-label="Filter by status"
        value={view}
        onChange={setView}
        items={[
          { value: "all", label: "All" },
          { value: "active", label: "Active" },
          { value: "draft", label: "Draft" },
          { value: "archived", label: "Archived" },
        ]}
      />
      <Input
        placeholder="Search catalogs"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-md"
        aria-label="Search catalogs"
      />
      {error && <Alert variant="error">{error}</Alert>}
      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(c) => c.id}
        loading={loading}
        onRowClick={(c) => router.push(`/${storeSlug}/catalogs/${c.id}`)}
        empty={{
          title: filtered ? "No catalogs match" : "No catalogs yet",
          description: filtered
            ? "Try a different search or status."
            : "Create a catalog, add products, then assign it to companies.",
          action:
            canWrite && !filtered ? (
              <Button onClick={() => setCreating(true)}>Create your first catalog</Button>
            ) : undefined,
        }}
        pageInfo={{
          hasNextPage: hasNext,
          onNext: () => void load(cursor, true),
          onFirst: pages.length > 1 ? () => void load(null, false) : undefined,
        }}
      />
      <NewCatalogDialog
        storeId={storeId}
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => router.push(`/${storeSlug}/catalogs/${id}`)}
      />
    </div>
  );
}

function NewCatalogDialog({
  storeId,
  open,
  onClose,
  onCreated,
}: {
  storeId: string;
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const submit = useSubmit();
  const { reset } = submit;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  useEffect(() => {
    reset();
    setName("");
    setDescription("");
  }, [open, reset]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const res = await submit.run(() =>
      api<{ data: CatalogSummary }>(`/stores/${storeId}/catalogs`, {
        body: { name, description: description.trim() || null },
      }),
    );
    if (res) onCreated(res.data.id);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New catalog"
      description="Starts as a draft: it restricts nobody until you activate it."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button type="submit" form="new-catalog" loading={submit.pending}>
            Create
          </Button>
        </>
      }
    >
      <form id="new-catalog" onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        <FormField id="cat-name" label="Name" error={submit.fieldErrors.name}>
          <Input
            id="cat-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
            invalid={!!submit.fieldErrors.name}
            autoFocus
          />
        </FormField>
        <FormField id="cat-desc" label="Description" error={submit.fieldErrors.description}>
          <Textarea
            id="cat-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
          />
        </FormField>
      </form>
    </Dialog>
  );
}
