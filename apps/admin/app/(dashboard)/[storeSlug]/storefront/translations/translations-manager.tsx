"use client";

import {
  PRODUCT_TRANSLATABLE_FIELDS,
  type GlossaryTermSummary,
  type ProductTranslatableField,
  type ProductTranslationDetail,
  type ProductTranslationListItem,
  type StoreLanguageSummary,
  type TranslationStatus,
} from "@ocean/types";
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
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { api, errorMessage } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

const FIELD_LABEL: Record<ProductTranslatableField, string> = {
  title: "Title",
  descriptionHtml: "Description",
  seoTitle: "SEO title",
  seoDescription: "SEO description",
};

const STATUS_VARIANT: Record<TranslationStatus | "not_translated", "success" | "secondary" | "outline"> = {
  not_translated: "outline",
  draft: "secondary",
  reviewed: "secondary",
  published: "success",
};

const STATUS_LABEL: Record<TranslationStatus | "not_translated", string> = {
  not_translated: "Not translated",
  draft: "Draft",
  reviewed: "Reviewed",
  published: "Published",
};

// Localization -> Translations (spec sections 5 & 7). Two panels: Products (the real, complete
// translation boundary for this pass — title/description/SEO) and Glossary (brand terms that
// must never be translated). Collections/Pages/Blog/Menus/checkout content are explicitly out of
// scope here; they can reuse the same generic Translation table in a later pass.
export function TranslationsManager({ storeId, canWrite }: { storeId: string; canWrite: boolean }) {
  const [tab, setTab] = useState<"products" | "glossary">("products");
  const [languages, setLanguages] = useState<StoreLanguageSummary[]>([]);
  const [languagesLoaded, setLanguagesLoaded] = useState(false);
  const [locale, setLocale] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api<{ data: StoreLanguageSummary[] }>(`/stores/${storeId}/languages`);
        if (cancelled) return;
        setLanguages(res.data);
        const firstNonDefault = res.data.find((l) => !l.isDefault) ?? null;
        setLocale((current) => current || firstNonDefault?.locale || "");
      } finally {
        if (!cancelled) setLanguagesLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  const targetLanguages = useMemo(() => languages.filter((l) => !l.isDefault), [languages]);

  if (languagesLoaded && targetLanguages.length === 0) {
    return (
      <Alert variant="warning">
        Add at least one non-default storefront language under Storefront → Languages before translating content.
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-md border p-1">
          <Button size="sm" variant={tab === "products" ? "secondary" : "ghost"} onClick={() => setTab("products")}>
            Products
          </Button>
          <Button size="sm" variant={tab === "glossary" ? "secondary" : "ghost"} onClick={() => setTab("glossary")}>
            Glossary
          </Button>
        </div>
        {tab === "products" && targetLanguages.length > 0 && (
          <FormField id="translations-locale" label="Translate into" className="w-48">
            <Select id="translations-locale" value={locale} onChange={(e) => setLocale(e.target.value)}>
              {targetLanguages.map((l) => (
                <option key={l.locale} value={l.locale}>
                  {l.locale}
                </option>
              ))}
            </Select>
          </FormField>
        )}
      </div>
      {tab === "products" ? (
        locale && <ProductTranslations storeId={storeId} locale={locale} canWrite={canWrite} />
      ) : (
        <GlossaryPanel storeId={storeId} canWrite={canWrite} />
      )}
    </div>
  );
}

function ProductTranslations({ storeId, locale, canWrite }: { storeId: string; locale: string; canWrite: boolean }) {
  const [rows, setRows] = useState<ProductTranslationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ locale });
      if (q.trim()) qs.set("q", q.trim());
      const res = await api<{ data: ProductTranslationListItem[] }>(
        `/stores/${storeId}/translations/products?${qs.toString()}`,
      );
      setRows(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [storeId, locale, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: DataGridColumn<ProductTranslationListItem>[] = [
    { key: "product", header: "Product", cell: (r) => <span className="font-medium">{r.productTitle}</span> },
    { key: "handle", header: "Handle", cell: (r) => r.productHandle },
    {
      key: "status",
      header: "Status",
      cell: (r) => <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>,
    },
    {
      key: "fields",
      header: "Fields translated",
      cell: (r) => `${r.translatedFieldCount} / ${r.totalFieldCount}`,
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (r) => (
        <Button size="sm" variant="ghost" onClick={() => setEditingProductId(r.productId)}>
          {canWrite ? "Translate" : "View"}
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Input
        placeholder="Search products…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-xs"
        aria-label="Search products"
      />
      {error && <Alert variant="error">{error}</Alert>}
      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(r) => r.productId}
        loading={loading}
        empty={{ title: "No products", description: "Add products to the catalog to translate them here." }}
      />
      <ProductTranslationDialog
        storeId={storeId}
        locale={locale}
        productId={editingProductId}
        canWrite={canWrite}
        onClose={() => setEditingProductId(null)}
        onSaved={() => void load()}
      />
    </div>
  );
}

function ProductTranslationDialog({
  storeId,
  locale,
  productId,
  canWrite,
  onClose,
  onSaved,
}: {
  storeId: string;
  locale: string;
  productId: string | null;
  canWrite: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const submit = useSubmit();
  const { reset } = submit;
  const [detail, setDetail] = useState<ProductTranslationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [values, setValues] = useState<Record<ProductTranslatableField, string>>({
    title: "",
    descriptionHtml: "",
    seoTitle: "",
    seoDescription: "",
  });

  useEffect(() => {
    if (!productId) {
      setDetail(null);
      return;
    }
    reset();
    setLoading(true);
    void (async () => {
      try {
        const res = await api<{ data: ProductTranslationDetail }>(
          `/stores/${storeId}/translations/products/${productId}?locale=${encodeURIComponent(locale)}`,
        );
        setDetail(res.data);
        const next: Record<ProductTranslatableField, string> = { title: "", descriptionHtml: "", seoTitle: "", seoDescription: "" };
        for (const field of PRODUCT_TRANSLATABLE_FIELDS) {
          next[field] = res.data.fields[field]?.value ?? "";
        }
        setValues(next);
      } catch {
        setDetail(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [productId, locale, storeId, reset]);

  async function save(status?: TranslationStatus) {
    if (!productId) return;
    // Only send fields the translator actually filled in — an empty string is "leave this field
    // untranslated" here, not "save an empty translation", so it must stay `undefined` (the API
    // skips undefined fields entirely) rather than round-trip as "".
    const fieldValues: Partial<Record<ProductTranslatableField, string>> = {};
    for (const field of PRODUCT_TRANSLATABLE_FIELDS) {
      if (values[field].trim()) fieldValues[field] = values[field];
    }
    const res = await submit.run(() =>
      api(`/stores/${storeId}/translations/products/${productId}`, {
        body: {
          locale,
          ...fieldValues,
          ...(status ? { status } : {}),
        },
      }),
    );
    if (res !== undefined) {
      onSaved();
      onClose();
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await save();
  }

  return (
    <Dialog
      open={!!productId}
      onClose={onClose}
      title={detail ? `Translate "${detail.productTitle}" → ${locale}` : "Translate product"}
      footer={
        canWrite ? (
          <>
            <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
              Cancel
            </Button>
            <Button variant="secondary" loading={submit.pending} onClick={() => void save("reviewed")}>
              Save & mark reviewed
            </Button>
            <Button type="submit" form="product-translation-form" loading={submit.pending}>
              Save as draft
            </Button>
            <Button loading={submit.pending} onClick={() => void save("published")}>
              Publish
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      {loading || !detail ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <form id="product-translation-form" onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
          {submit.error && <Alert variant="error">{submit.error}</Alert>}
          <p className="text-xs text-muted-foreground">
            Source ({detail.sourceLocale}) shown for reference below each field. Editing here never changes the
            default-language content.
          </p>
          {PRODUCT_TRANSLATABLE_FIELDS.map((field) => {
            const suggestion = detail.fields[field]?.memorySuggestion ?? null;
            const source = detail.source[field] ?? "";
            return (
              <FormField key={field} id={`field-${field}`} label={FIELD_LABEL[field]}>
                <div className="flex flex-col gap-1">
                  {field === "descriptionHtml" ? (
                    <Textarea
                      id={`field-${field}`}
                      rows={5}
                      value={values[field]}
                      disabled={!canWrite}
                      onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
                    />
                  ) : (
                    <Input
                      id={`field-${field}`}
                      value={values[field]}
                      disabled={!canWrite}
                      onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
                    />
                  )}
                  {source && (
                    <p className="truncate text-xs text-muted-foreground" title={source}>
                      Source: {source}
                    </p>
                  )}
                  {canWrite && suggestion && !values[field] && (
                    <button
                      type="button"
                      className="w-fit text-left text-xs text-primary underline-offset-2 hover:underline"
                      onClick={() => setValues((v) => ({ ...v, [field]: suggestion }))}
                    >
                      Use translation memory suggestion: &ldquo;{suggestion}&rdquo;
                    </button>
                  )}
                </div>
              </FormField>
            );
          })}
        </form>
      )}
    </Dialog>
  );
}

function GlossaryPanel({ storeId, canWrite }: { storeId: string; canWrite: boolean }) {
  const [rows, setRows] = useState<GlossaryTermSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ kind: "new" } | { kind: "edit"; term: GlossaryTermSummary } | null>(null);
  const [deleting, setDeleting] = useState<GlossaryTermSummary | null>(null);
  const action = useSubmit();

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ data: GlossaryTermSummary[] }>(`/stores/${storeId}/translations/glossary`);
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

  const columns: DataGridColumn<GlossaryTermSummary>[] = [
    { key: "term", header: "Term", cell: (t) => <span className="font-medium">{t.term}</span> },
    { key: "notes", header: "Notes", cell: (t) => t.notes ?? "—" },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "",
            className: "text-right",
            cell: (t: GlossaryTermSummary) => (
              <div className="flex flex-wrap justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing({ kind: "edit", term: t })}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(t)}>
                  Delete
                </Button>
              </div>
            ),
          } satisfies DataGridColumn<GlossaryTermSummary>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Brand and product terms that should never be translated — surfaced to translators as a reminder.
        </p>
        {canWrite && <Button onClick={() => setEditing({ kind: "new" })}>Add term</Button>}
      </div>
      {(error ?? action.error) && <Alert variant="error">{error ?? action.error}</Alert>}
      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(t) => t.id}
        loading={loading}
        empty={{ title: "No glossary terms yet", description: "Add terms like your store or product line names." }}
      />
      <GlossaryDialog storeId={storeId} editing={editing} onClose={() => setEditing(null)} onSaved={() => void load()} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete "${deleting?.term ?? ""}"?`}
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          const ok = await action.run(() => api(`/stores/${storeId}/translations/glossary/${deleting.id}`, { method: "DELETE" }));
          if (ok !== undefined) await load();
          setDeleting(null);
        }}
      />
    </div>
  );
}

function GlossaryDialog({
  storeId,
  editing,
  onClose,
  onSaved,
}: {
  storeId: string;
  editing: { kind: "new" } | { kind: "edit"; term: GlossaryTermSummary } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const submit = useSubmit();
  const { reset } = submit;
  const [term, setTerm] = useState("");
  const [notes, setNotes] = useState("");
  const current = editing?.kind === "edit" ? editing.term : null;

  useEffect(() => {
    reset();
    setTerm(current?.term ?? "");
    setNotes(current?.notes ?? "");
  }, [current, editing, reset]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = { term: term.trim(), notes: notes.trim() || null };
    const res = await submit.run(() =>
      current
        ? api(`/stores/${storeId}/translations/glossary/${current.id}`, { method: "PATCH", body })
        : api(`/stores/${storeId}/translations/glossary`, { body }),
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
      title={current ? "Edit term" : "Add term"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button type="submit" form="glossary-form" loading={submit.pending}>
            {current ? "Save" : "Add"}
          </Button>
        </>
      }
    >
      <form id="glossary-form" onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        <FormField id="glossary-term" label="Term" error={submit.fieldErrors.term}>
          <Input id="glossary-term" value={term} onChange={(e) => setTerm(e.target.value)} required autoFocus />
        </FormField>
        <FormField id="glossary-notes" label="Notes (optional)" error={submit.fieldErrors.notes}>
          <Input id="glossary-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FormField>
      </form>
    </Dialog>
  );
}
