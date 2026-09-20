"use client";

import {
  CATALOG_STATUSES,
  type CatalogDetail,
  type CatalogProductEntry,
  type CatalogStatus,
  type Paginated,
  type ProductSummary,
} from "@ocean/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  ConfirmDialog,
  DataGrid,
  Dialog,
  FormField,
  Input,
  Select,
  Tabs,
  Textarea,
  type DataGridColumn,
} from "@ocean/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { AssignmentsCard } from "@/components/assignments-card";
import { api, ApiClientError, errorMessage } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

import { CATALOG_STATUS_BADGE } from "../catalogs-list";

type DetailTab = "products" | "companies" | "pricing";

export function CatalogDetailView({
  storeId,
  storeSlug,
  catalog,
  canWrite,
}: {
  storeId: string;
  storeSlug: string;
  catalog: CatalogDetail;
  canWrite: boolean;
}) {
  const router = useRouter();
  const submit = useSubmit();
  const [name, setName] = useState(catalog.name);
  const [description, setDescription] = useState(catalog.description ?? "");
  const [status, setStatus] = useState<CatalogStatus>(catalog.status);
  const [version, setVersion] = useState(catalog.version);
  const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tab, setTab] = useState<DetailTab>("products");
  const base = `/stores/${storeId}/catalogs/${catalog.id}`;

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setConflict(false);
    setSaved(false);
    const res = await submit.run(async () => {
      try {
        return await api<{ data: CatalogDetail }>(base, {
          method: "PATCH",
          body: { name, description: description.trim() || null, status, version },
        });
      } catch (err) {
        if (err instanceof ApiClientError && err.code === "conflict" && !err.fields.length) {
          setConflict(true);
        }
        throw err;
      }
    });
    if (res) {
      setVersion(res.data.version);
      setSaved(true);
      router.refresh();
    }
  }

  async function onDelete() {
    const ok = await submit.run(() => api(base, { method: "DELETE" }));
    if (ok !== undefined) router.push(`/${storeSlug}/catalogs`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/${storeSlug}/catalogs`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Catalogs
          </Link>
          <h1 className="truncate text-2xl font-semibold tracking-tight">{catalog.name}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant={CATALOG_STATUS_BADGE[catalog.status]}>{catalog.status}</Badge>
            <span>
              {catalog.productCount} products · assigned to {catalog.assignmentCount}
            </span>
          </div>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
            <Button type="submit" form="catalog-form" loading={submit.pending}>
              Save
            </Button>
          </div>
        )}
      </div>
      {conflict && (
        <Alert variant="warning" title="Someone else saved this catalog">
          Reload the page to see their changes, then apply yours again.
        </Alert>
      )}
      {submit.error && !conflict && <Alert variant="error">{submit.error}</Alert>}
      {saved && <Alert variant="success">Saved.</Alert>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr] lg:items-start">
        <div className="flex flex-col gap-4">
          <Tabs
            aria-label="Catalog sections"
            value={tab}
            onChange={setTab}
            items={[
              { value: "products", label: "Products", count: catalog.productCount },
              { value: "companies", label: "Companies", count: catalog.assignmentCount },
              { value: "pricing", label: "Pricing" },
            ]}
          />
          {tab === "products" && (
            <CatalogProducts
              storeId={storeId}
              storeSlug={storeSlug}
              catalogId={catalog.id}
              canWrite={canWrite}
            />
          )}
          {tab === "companies" && (
            <AssignmentsCard
              storeId={storeId}
              storeSlug={storeSlug}
              endpoint={`${base}/assignments`}
              assignments={catalog.assignments}
              canWrite={canWrite}
              description="Companies and locations limited to this catalog. A company with an active catalog sees only what's in it."
            />
          )}
          {tab === "pricing" && <CatalogPricingInfo storeSlug={storeSlug} catalog={catalog} />}
        </div>
        <div className="flex flex-col gap-6">
          <form id="catalog-form" onSubmit={(e) => void onSave(e)}>
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
                <CardDescription>Only active catalogs restrict what buyers see.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <FormField id="cat-name" label="Name" error={submit.fieldErrors.name}>
                  <Input
                    id="cat-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={120}
                    disabled={!canWrite}
                    invalid={!!submit.fieldErrors.name}
                  />
                </FormField>
                <FormField id="cat-status" label="Status">
                  <Select
                    id="cat-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as CatalogStatus)}
                    disabled={!canWrite}
                  >
                    {CATALOG_STATUSES.map((s) => (
                      <option key={s} value={s} className="capitalize">
                        {s}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField id="cat-desc" label="Description" error={submit.fieldErrors.description}>
                  <Textarea
                    id="cat-desc"
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={1000}
                    disabled={!canWrite}
                  />
                </FormField>
              </CardContent>
            </Card>
          </form>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={onDelete}
        title={`Delete ${catalog.name}?`}
        description="Companies assigned to it fall back to the public assortment (or their other catalogs)."
        confirmLabel="Delete"
        destructive
        pending={submit.pending}
      />
    </div>
  );
}

// Read-only orientation panel. A Catalog only restricts *which products* a company can see —
// it has no currency or discount field of its own (unlike the spec's illustrative example,
// which describes a catalog with a "Currency" and single "Pricing adjustment" percentage; in
// this codebase that's what a PriceList is). Prices for this catalog's companies come from
// whatever Price Lists / Contract Prices / Volume Pricing are separately assigned to them in
// the Pricing module. There's also no "Markets" (multi-currency/region) concept yet — the
// pricing.ts schema notes it "arrives with Markets (Phase 8)" — so that's called out rather
// than shown as a fake tab.
function CatalogPricingInfo({ storeSlug, catalog }: { storeSlug: string; catalog: CatalogDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pricing</CardTitle>
        <CardDescription>
          A catalog only controls visibility, not price. Prices for the companies assigned above
          come from whatever Price Lists, Contract Prices and Volume Pricing rules are assigned to
          them separately.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <div className="font-medium">How a price is resolved for a buyer</div>
          <ol className="list-decimal space-y-1 pl-4 text-muted-foreground">
            <li>Contract price (negotiated for that company/location) — wins if set</li>
            <li>Price list assigned to the company/location (fixed price, or a % adjustment)</li>
            <li>Volume pricing tier for the quantity ordered</li>
            <li>Base product price</li>
          </ol>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/${storeSlug}/pricing`} className="text-sm text-primary hover:underline">
            Manage price lists →
          </Link>
          <Link href={`/${storeSlug}/pricing/contracts`} className="text-sm text-primary hover:underline">
            Manage contract prices →
          </Link>
          <Link href={`/${storeSlug}/pricing/volume`} className="text-sm text-primary hover:underline">
            Manage volume pricing →
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">
          Multi-currency &quot;Markets&quot; are not implemented in this store yet — catalogs and
          price lists apply in the store&apos;s currency
          {catalog.assignmentCount > 0
            ? ` for all ${catalog.assignmentCount} assigned compan${catalog.assignmentCount === 1 ? "y" : "ies"}/locations.`
            : "."}
        </p>
      </CardContent>
    </Card>
  );
}

function CatalogProducts({
  storeId,
  storeSlug,
  catalogId,
  canWrite,
}: {
  storeId: string;
  storeSlug: string;
  catalogId: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [pages, setPages] = useState<CatalogProductEntry[][]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const base = `/stores/${storeId}/catalogs/${catalogId}/products`;

  const load = useCallback(
    async (after: string | null, append: boolean) => {
      setLoading(!append);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: "25" });
        if (q.trim()) params.set("q", q.trim());
        if (after) params.set("cursor", after);
        const res = await api<Paginated<CatalogProductEntry>>(`${base}?${params}`);
        setPages((prev) => (append ? [...prev, res.data] : [res.data]));
        setCursor(res.pageInfo.endCursor);
        setHasNext(res.pageInfo.hasNextPage);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [base, q],
  );
  useEffect(() => {
    const handle = setTimeout(() => void load(null, false), q ? 250 : 0);
    return () => clearTimeout(handle);
  }, [load, q]);
  const rows = useMemo(() => pages.flat(), [pages]);

  async function removeSelected() {
    setBusy(true);
    setError(null);
    try {
      await api(`${base}/remove`, { body: { productIds: [...selected] } });
      setSelected(new Set());
      await load(null, false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const columns: DataGridColumn<CatalogProductEntry>[] = [
    {
      key: "title",
      header: "Product",
      cell: (p) => (
        <div className="flex items-center gap-3">
          {p.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.image.url}
              alt={p.image.alt ?? ""}
              className="h-9 w-9 rounded border object-cover"
            />
          ) : (
            <div className="h-9 w-9 rounded border bg-muted" aria-hidden />
          )}
          <div>
            <Link
              href={`/${storeSlug}/products/${p.productId}`}
              className="font-medium hover:underline"
            >
              {p.title}
            </Link>
            <div className="text-xs text-muted-foreground">{p.vendor ?? "—"}</div>
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (p) => (
        <Badge variant={p.status === "active" ? "success" : "secondary"}>{p.status}</Badge>
      ),
    },
    {
      key: "variants",
      header: "Variants",
      className: "text-right",
      cell: (p) => <span className="tabular-nums">{p.variantCount}</span>,
    },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>Products</CardTitle>
          <CardDescription>
            Everything a buyer on this catalog may see. Inactive products stay hidden.
          </CardDescription>
        </div>
        {canWrite && (
          <Button type="button" size="sm" onClick={() => setAdding(true)}>
            Add products
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input
          placeholder="Search in this catalog"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
          aria-label="Search catalog products"
        />
        {error && <Alert variant="error">{error}</Alert>}
        <DataGrid
          columns={columns}
          rows={rows}
          rowKey={(p) => p.productId}
          loading={loading}
          selectable={canWrite}
          selected={selected}
          onSelectedChange={setSelected}
          bulkActions={
            <Button
              size="sm"
              variant="destructive"
              loading={busy}
              onClick={() => void removeSelected()}
            >
              Remove from catalog
            </Button>
          }
          empty={{
            title: q ? "No products match" : "No products yet",
            description: q
              ? "Try another search."
              : "Add products so buyers on this catalog can see them.",
            action:
              canWrite && !q ? (
                <Button type="button" onClick={() => setAdding(true)}>
                  Add products
                </Button>
              ) : undefined,
          }}
          pageInfo={{
            hasNextPage: hasNext,
            onNext: () => void load(cursor, true),
            onFirst: pages.length > 1 ? () => void load(null, false) : undefined,
          }}
        />
      </CardContent>
      <AddProductsDialog
        storeId={storeId}
        endpoint={base}
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={() => {
          void load(null, false);
          router.refresh();
        }}
      />
    </Card>
  );
}

function AddProductsDialog({
  storeId,
  endpoint,
  open,
  onClose,
  onAdded,
}: {
  storeId: string;
  endpoint: string;
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const submit = useSubmit();
  const { reset } = submit;
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ProductSummary[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    reset();
    setQ("");
    setPicked(new Set());
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      void api<Paginated<ProductSummary>>(
        `/stores/${storeId}/products?limit=25&q=${encodeURIComponent(q)}`,
      )
        .then((res) => setResults(res.data))
        .catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(handle);
  }, [open, q, storeId]);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const res = await submit.run(() => api(endpoint, { body: { productIds: [...picked] } }));
    if (res !== undefined) {
      onAdded();
      onClose();
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add products to catalog"
      className="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="add-products"
            loading={submit.pending}
            disabled={picked.size === 0}
          >
            Add {picked.size || ""}
          </Button>
        </>
      }
    >
      <form id="add-products" onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        <Input
          placeholder="Search products"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        <div className="max-h-72 overflow-y-auto rounded-md border text-sm">
          {results.length === 0 && (
            <p className="px-3 py-2 text-muted-foreground">No products found.</p>
          )}
          {results.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-accent"
            >
              <Checkbox checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
              <span className="flex-1">{p.title}</span>
              <Badge variant={p.status === "active" ? "success" : "secondary"}>{p.status}</Badge>
            </label>
          ))}
        </div>
      </form>
    </Dialog>
  );
}
