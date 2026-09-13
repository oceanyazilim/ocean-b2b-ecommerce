"use client";

import {
  COLLECTION_RULE_FIELDS,
  COLLECTION_RULE_OPERATORS,
  type CollectionDetail,
  type CollectionRule,
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
  Dialog,
  EmptyState,
  FormField,
  Input,
  Select,
  Textarea,
} from "@ocean/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { api, ApiClientError, errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { useSubmit } from "@/lib/use-submit";

const FIELD_LABEL: Record<CollectionRule["field"], string> = {
  title: "Title",
  product_type: "Product type",
  vendor: "Vendor",
  tag: "Tag",
  price: "Price",
  category: "Category path",
  status: "Status",
};
const OPERATOR_LABEL: Record<CollectionRule["operator"], string> = {
  equals: "is equal to",
  not_equals: "is not equal to",
  contains: "contains",
  not_contains: "does not contain",
  starts_with: "starts with",
  ends_with: "ends with",
  gt: "is greater than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
};
const TEXT_OPS = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
] as const;
const NUMBER_OPS = ["equals", "not_equals", "gt", "gte", "lt", "lte"] as const;

export function CollectionForm({
  storeId,
  storeSlug,
  collection,
  readOnly = false,
}: {
  storeId: string;
  storeSlug: string;
  collection: CollectionDetail | null;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const { pending, error, fieldErrors, run } = useSubmit();
  const [title, setTitle] = useState(collection?.title ?? "");
  const [handle, setHandle] = useState(collection?.handle ?? "");
  const [descriptionHtml, setDescription] = useState(collection?.descriptionHtml ?? "");
  const [type, setType] = useState<"manual" | "automated">(collection?.type ?? "manual");
  const [rules, setRules] = useState<CollectionRule[]>(
    collection?.rules ?? [{ field: "tag", operator: "equals", value: "" }],
  );
  const [rulesMatchAll, setRulesMatchAll] = useState(collection?.rulesMatchAll ?? true);
  const [sortOrder, setSortOrder] = useState(collection?.sortOrder ?? "manual");
  const [published, setPublished] = useState(collection?.published ?? true);
  const [seoTitle, setSeoTitle] = useState(collection?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(collection?.seoDescription ?? "");
  const [version, setVersion] = useState(collection?.version ?? 1);
  const [conflict, setConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [preview, setPreview] = useState<{ count: number; sample: string[] } | null>(null);

  // Members (edit mode)
  const [members, setMembers] = useState<ProductSummary[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQ, setPickerQ] = useState("");
  const [pickerRows, setPickerRows] = useState<ProductSummary[]>([]);
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(new Set());

  const loadMembers = useCallback(async () => {
    if (!collection) return;
    setMembersLoading(true);
    try {
      const res = await api<Paginated<ProductSummary>>(
        `/stores/${storeId}/collections/${collection.id}/products?limit=100`,
      );
      setMembers(res.data);
    } catch (err) {
      setMemberError(errorMessage(err));
    } finally {
      setMembersLoading(false);
    }
  }, [storeId, collection]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    if (type !== "automated") return;
    const usable = rules.filter((r) => r.value.trim());
    if (usable.length === 0) {
      setPreview(null);
      return;
    }
    const handle = setTimeout(() => {
      api<{ data: { count: number; sample: string[] } }>(`/stores/${storeId}/collections/preview`, {
        body: { rules: usable, rulesMatchAll },
      })
        .then((res) => setPreview(res.data))
        .catch(() => setPreview(null));
    }, 300);
    return () => clearTimeout(handle);
  }, [storeId, type, rules, rulesMatchAll]);

  useEffect(() => {
    if (!pickerOpen) return;
    const handle = setTimeout(() => {
      const params = new URLSearchParams({ limit: "50" });
      if (pickerQ.trim()) params.set("q", pickerQ.trim());
      api<Paginated<ProductSummary>>(`/stores/${storeId}/products?${params}`)
        .then((res) => setPickerRows(res.data))
        .catch(() => setPickerRows([]));
    }, 200);
    return () => clearTimeout(handle);
  }, [pickerOpen, pickerQ, storeId]);

  function updateRule(i: number, patch: Partial<CollectionRule>) {
    setRules((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function body() {
    return {
      title,
      ...(handle ? { handle } : {}),
      descriptionHtml,
      rules: type === "automated" ? rules.filter((r) => r.value.trim()) : [],
      rulesMatchAll,
      sortOrder,
      seoTitle: seoTitle || null,
      seoDescription: seoDescription || null,
      published,
    };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setConflict(false);
    const res = await run(async () => {
      try {
        return collection
          ? (
              await api<{ data: CollectionDetail }>(
                `/stores/${storeId}/collections/${collection.id}`,
                { method: "PATCH", body: { ...body(), version } },
              )
            ).data
          : (
              await api<{ data: CollectionDetail }>(`/stores/${storeId}/collections`, {
                body: { ...body(), type },
              })
            ).data;
      } catch (err) {
        if (err instanceof ApiClientError && err.code === "conflict") setConflict(true);
        throw err;
      }
    });
    if (!res) return;
    if (!collection) router.replace(`/${storeSlug}/collections/${res.id}`);
    else {
      setVersion(res.version);
      setHandle(res.handle);
      await loadMembers();
    }
    router.refresh();
  }

  async function remove() {
    if (!collection) return;
    await run(() => api(`/stores/${storeId}/collections/${collection.id}`, { method: "DELETE" }));
    router.replace(`/${storeSlug}/collections`);
    router.refresh();
  }

  async function addSelected() {
    if (!collection || pickerSelected.size === 0) return;
    setMemberError(null);
    try {
      await api(`/stores/${storeId}/collections/${collection.id}/products`, {
        body: { productIds: [...pickerSelected] },
      });
      setPickerOpen(false);
      setPickerSelected(new Set());
      await loadMembers();
      router.refresh();
    } catch (err) {
      setMemberError(errorMessage(err));
    }
  }

  async function removeMember(productId: string) {
    if (!collection) return;
    try {
      await api(`/stores/${storeId}/collections/${collection.id}/products`, {
        method: "DELETE",
        body: { productIds: [productId] },
      });
      await loadMembers();
      router.refresh();
    } catch (err) {
      setMemberError(errorMessage(err));
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href={`/${storeSlug}/collections`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Collections
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            {collection ? collection.title : "New collection"}
          </h1>
          {collection && <Badge variant="outline">{collection.type}</Badge>}
        </div>
        {!readOnly && (
          <div className="flex gap-2">
            {collection && (
              <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            )}
            <Button type="submit" loading={pending}>
              {collection ? "Save" : "Create collection"}
            </Button>
          </div>
        )}
      </div>

      {conflict && (
        <Alert variant="warning" title="Someone else changed this collection">
          Reload to see their changes before saving yours.{" "}
          <button type="button" className="underline" onClick={() => router.refresh()}>
            Reload now
          </button>
        </Alert>
      )}
      {error && !conflict && <Alert variant="error">{error}</Alert>}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardContent className="flex flex-col gap-4 pt-6">
              <FormField id="title" label="Title" error={fieldErrors["title"]}>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={readOnly}
                  invalid={!!fieldErrors["title"]}
                />
              </FormField>
              <FormField
                id="description"
                label="Description"
                error={fieldErrors["descriptionHtml"]}
              >
                <Textarea
                  id="description"
                  rows={4}
                  value={descriptionHtml}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={readOnly}
                />
              </FormField>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Products</CardTitle>
              <CardDescription>
                {collection
                  ? "The type cannot change after creation."
                  : "Choose how products get into this collection."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {!collection && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  {(["manual", "automated"] as const).map((t) => (
                    <label
                      key={t}
                      className={`flex flex-1 cursor-pointer gap-3 rounded-md border p-3 ${type === t ? "border-primary bg-accent/40" : ""}`}
                    >
                      <input
                        type="radio"
                        name="type"
                        value={t}
                        checked={type === t}
                        onChange={() => setType(t)}
                        className="mt-1"
                      />
                      <span>
                        <span className="block text-sm font-medium">
                          {t === "manual" ? "Manual" : "Automated"}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {t === "manual"
                            ? "Add products one by one."
                            : "Products that match your rules are added automatically."}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {type === "automated" && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3 text-sm">
                    <span>Products must match</span>
                    <Select
                      value={rulesMatchAll ? "all" : "any"}
                      onChange={(e) => setRulesMatchAll(e.target.value === "all")}
                      className="h-8 w-28"
                      disabled={readOnly}
                    >
                      <option value="all">all</option>
                      <option value="any">any</option>
                    </Select>
                    <span>conditions</span>
                  </div>
                  {fieldErrors["rules"] && <Alert variant="error">{fieldErrors["rules"]}</Alert>}
                  {rules.map((r, i) => {
                    const ops = r.field === "price" ? NUMBER_OPS : TEXT_OPS;
                    return (
                      <div
                        key={i}
                        className="grid grid-cols-1 gap-2 sm:grid-cols-[160px_180px_1fr_auto]"
                      >
                        <Select
                          aria-label="Field"
                          value={r.field}
                          onChange={(e) =>
                            updateRule(i, {
                              field: e.target.value as CollectionRule["field"],
                              operator: e.target.value === "price" ? "gte" : "equals",
                            })
                          }
                          disabled={readOnly}
                        >
                          {COLLECTION_RULE_FIELDS.map((f) => (
                            <option key={f} value={f}>
                              {FIELD_LABEL[f]}
                            </option>
                          ))}
                        </Select>
                        <Select
                          aria-label="Operator"
                          value={r.operator}
                          onChange={(e) =>
                            updateRule(i, {
                              operator: e.target.value as CollectionRule["operator"],
                            })
                          }
                          disabled={readOnly}
                        >
                          {COLLECTION_RULE_OPERATORS.filter((o) =>
                            (ops as readonly string[]).includes(o),
                          ).map((o) => (
                            <option key={o} value={o}>
                              {OPERATOR_LABEL[o]}
                            </option>
                          ))}
                        </Select>
                        <Input
                          aria-label="Value"
                          placeholder={r.field === "price" ? "e.g. 100" : "Value"}
                          value={r.value}
                          onChange={(e) => updateRule(i, { value: e.target.value })}
                          disabled={readOnly}
                        />
                        {!readOnly && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setRules((prev) => prev.filter((_, idx) => idx !== i))}
                            disabled={rules.length === 1}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    );
                  })}
                  {!readOnly && (
                    <div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setRules((prev) => [
                            ...prev,
                            { field: "tag", operator: "equals", value: "" },
                          ])
                        }
                      >
                        Add condition
                      </Button>
                    </div>
                  )}
                  {preview && (
                    <Alert variant="info">
                      <strong>{preview.count}</strong> product{preview.count === 1 ? "" : "s"} match
                      right now
                      {preview.sample.length > 0 && (
                        <>
                          : {preview.sample.join(", ")}
                          {preview.count > preview.sample.length ? ", …" : ""}
                        </>
                      )}
                    </Alert>
                  )}
                </div>
              )}

              {collection && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {members.length} product{members.length === 1 ? "" : "s"} in this collection
                    </span>
                    {type === "manual" && !readOnly && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPickerOpen(true)}
                      >
                        Add products
                      </Button>
                    )}
                  </div>
                  {memberError && <Alert variant="error">{memberError}</Alert>}
                  {membersLoading ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                  ) : members.length === 0 ? (
                    <EmptyState
                      title="No products yet"
                      description={
                        type === "manual"
                          ? "Add products to build this collection."
                          : "No products match the rules yet."
                      }
                    />
                  ) : (
                    <ul className="divide-y rounded-md border">
                      {members.map((p) => (
                        <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                          {p.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.image.url}
                              alt=""
                              className="h-8 w-8 rounded border object-cover"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded border bg-muted" />
                          )}
                          <Link
                            href={`/${storeSlug}/products/${p.id}`}
                            className="flex-1 truncate font-medium hover:underline"
                          >
                            {p.title}
                          </Link>
                          <span className="text-muted-foreground">
                            {p.priceRange ? formatMoney(p.priceRange.min) : "—"}
                          </span>
                          {type === "manual" && !readOnly && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeMember(p.id)}
                            >
                              Remove
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Search engine listing</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <FormField id="seoTitle" label="Page title" error={fieldErrors["seoTitle"]}>
                <Input
                  id="seoTitle"
                  maxLength={70}
                  value={seoTitle}
                  onChange={(e) => setSeoTitle(e.target.value)}
                  disabled={readOnly}
                />
              </FormField>
              <FormField
                id="seoDescription"
                label="Meta description"
                error={fieldErrors["seoDescription"]}
              >
                <Textarea
                  id="seoDescription"
                  rows={3}
                  maxLength={320}
                  value={seoDescription}
                  onChange={(e) => setSeoDescription(e.target.value)}
                  disabled={readOnly}
                />
              </FormField>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Visibility</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={published}
                  onChange={(e) => setPublished(e.target.checked)}
                  disabled={readOnly}
                />
                Published on the storefront
              </label>
              <FormField
                id="handle"
                label="Handle"
                hint="Generated from the title when empty."
                error={fieldErrors["handle"]}
              >
                <Input
                  id="handle"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  disabled={readOnly}
                  invalid={!!fieldErrors["handle"]}
                />
              </FormField>
              <FormField id="sortOrder" label="Product order" error={fieldErrors["sortOrder"]}>
                <Select
                  id="sortOrder"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  disabled={readOnly}
                >
                  <option value="manual">Manual</option>
                  <option value="title_asc">Title A–Z</option>
                  <option value="title_desc">Title Z–A</option>
                  <option value="created_desc">Newest first</option>
                  <option value="price_asc">Price low to high</option>
                  <option value="price_desc">Price high to low</option>
                </Select>
              </FormField>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Add products"
        description="Search and pick products to add to this collection."
        className="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPickerOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void addSelected()} disabled={pickerSelected.size === 0}>
              Add {pickerSelected.size || ""}
            </Button>
          </>
        }
      >
        <Input
          placeholder="Search products"
          value={pickerQ}
          onChange={(e) => setPickerQ(e.target.value)}
          autoFocus
        />
        <ul className="max-h-80 divide-y overflow-y-auto rounded-md border">
          {pickerRows.map((p) => {
            const already = members.some((m) => m.id === p.id);
            return (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <Checkbox
                  checked={pickerSelected.has(p.id)}
                  disabled={already}
                  onChange={(e) =>
                    setPickerSelected((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(p.id);
                      else next.delete(p.id);
                      return next;
                    })
                  }
                />
                <span className="flex-1 truncate">{p.title}</span>
                {already && <Badge variant="outline">added</Badge>}
              </li>
            );
          })}
          {pickerRows.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              No products found.
            </li>
          )}
        </ul>
      </Dialog>

      {collection && (
        <ConfirmDialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          onConfirm={remove}
          title={`Delete "${collection.title}"?`}
          description="Products stay in the catalog; only the collection is removed."
          confirmLabel="Delete collection"
          destructive
          pending={pending}
        />
      )}
    </form>
  );
}
