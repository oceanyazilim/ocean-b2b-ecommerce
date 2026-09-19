"use client";

import type { Money, StorefrontVariantSearchResult } from "@ocean/types";
import { useEffect, useState, type ChangeEvent, type KeyboardEvent } from "react";

import { useCart } from "@/components/cart-provider";
import { api, errorMessage } from "@/lib/client-api";
import { formatMoney } from "@/lib/money";

interface QuickOrderRow {
  key: string;
  variantId: string | null;
  sku: string;
  productTitle: string;
  variantTitle: string;
  image: { url: string; alt: string | null } | null;
  price: Money | null;
  available: number | null;
  quantity: number;
  error: string | null;
  source: "search" | "manual" | "csv";
}

function rowFromResult(
  r: StorefrontVariantSearchResult,
  quantity: number,
  source: QuickOrderRow["source"],
  key?: string,
): QuickOrderRow {
  return {
    key: key ?? r.variantId,
    variantId: r.variantId,
    sku: r.sku ?? "",
    productTitle: r.productTitle,
    variantTitle: r.variantTitle,
    image: r.image,
    price: r.price,
    available: r.available,
    quantity,
    error: null,
    source,
  };
}

function parseCsv(text: string): { sku: string; quantity: number }[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];
  const splitLine = (line: string) => line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  const first = splitLine(lines[0]!);
  const looksLikeHeader = first.some((c) => /^sku$/i.test(c) || /^(qty|quantity)$/i.test(c));
  let skuIdx = 0;
  let qtyIdx = 1;
  let start = 0;
  if (looksLikeHeader) {
    const foundSku = first.findIndex((c) => /^sku$/i.test(c));
    const foundQty = first.findIndex((c) => /^(qty|quantity)$/i.test(c));
    skuIdx = foundSku >= 0 ? foundSku : 0;
    qtyIdx = foundQty >= 0 ? foundQty : 1;
    start = 1;
  }
  const out: { sku: string; quantity: number }[] = [];
  for (let i = start; i < lines.length; i++) {
    const cells = splitLine(lines[i]!);
    const sku = cells[skuIdx]?.trim();
    if (!sku) continue;
    const quantity = Math.max(1, Math.round(Number(cells[qtyIdx]) || 1));
    out.push({ sku, quantity });
  }
  return out;
}

export function QuickOrderView() {
  const { addItem } = useCart();
  const [rows, setRows] = useState<QuickOrderRow[]>([]);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StorefrontVariantSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);

  const [csvError, setCsvError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState<{ successCount: number; failCount: number } | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      api<{ data: StorefrontVariantSearchResult[] }>(`/products/variant-search?q=${encodeURIComponent(q)}&limit=8`)
        .then((res) => {
          setResults(res.data);
          setOpen(true);
        })
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  function selectResult(r: StorefrontVariantSearchResult) {
    setRows((prev) => {
      const idx = prev.findIndex((x) => x.variantId === r.variantId);
      const existing = idx >= 0 ? prev[idx] : undefined;
      if (existing) {
        const next = [...prev];
        next[idx] = { ...existing, quantity: existing.quantity + 1 };
        return next;
      }
      return [...prev, rowFromResult(r, 1, "search")];
    });
    setQuery("");
    setResults([]);
    setOpen(false);
    setSummary(null);
  }

  function addEmptyRow() {
    setRows((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        variantId: null,
        sku: "",
        productTitle: "",
        variantTitle: "",
        image: null,
        price: null,
        available: null,
        quantity: 1,
        error: null,
        source: "manual",
      },
    ]);
    setSummary(null);
  }

  function updateRowSku(key: string, sku: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, sku, error: null } : r)));
  }

  function updateRowQuantity(key: string, quantity: number) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, quantity } : r)));
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  async function resolveRow(key: string) {
    const row = rows.find((r) => r.key === key);
    if (!row || row.variantId || !row.sku.trim()) return;
    const lookedUpSku = row.sku.trim();
    try {
      const res = await api<{ data: StorefrontVariantSearchResult[] }>(
        `/products/variant-search?skus=${encodeURIComponent(lookedUpSku)}&limit=1`,
      );
      const match = res.data[0];
      setRows((prev) =>
        prev.map((r) => {
          if (r.key !== key) return r;
          // The user may have edited this row's SKU field while the lookup was in
          // flight. If the current value no longer matches what we looked up,
          // discard this stale response instead of overwriting their edit.
          if (r.sku.trim() !== lookedUpSku) return r;
          return match ? rowFromResult(match, r.quantity, "manual", key) : { ...r, error: "SKU not found in catalog" };
        }),
      );
    } catch {
      setRows((prev) =>
        prev.map((r) => (r.key === key && r.sku.trim() === lookedUpSku ? { ...r, error: "Couldn't look that up. Try again." } : r)),
      );
    }
  }

  function onSkuKeyDown(key: string, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void resolveRow(key);
    }
  }

  async function onCsvChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCsvError(null);
    setSummary(null);
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length === 0) {
      setCsvError("Couldn't find any SKU/quantity rows in that file. Expect columns: sku, quantity.");
      return;
    }
    const skuList = [...new Set(parsed.map((p) => p.sku))];
    try {
      const res = await api<{ data: StorefrontVariantSearchResult[] }>(
        `/products/variant-search?skus=${encodeURIComponent(skuList.join(","))}&limit=${skuList.length}`,
      );
      const bySku = new Map(res.data.filter((r) => r.sku).map((r) => [r.sku!.toLowerCase(), r]));
      setRows((prev) => {
        const next = [...prev];
        for (const p of parsed) {
          const match = bySku.get(p.sku.toLowerCase());
          if (match) {
            const idx = next.findIndex((r) => r.variantId === match.variantId);
            const existing = idx >= 0 ? next[idx] : undefined;
            if (existing) next[idx] = { ...existing, quantity: existing.quantity + p.quantity };
            else next.push(rowFromResult(match, p.quantity, "csv"));
          } else {
            next.push({
              key: crypto.randomUUID(),
              variantId: null,
              sku: p.sku,
              productTitle: "",
              variantTitle: "",
              image: null,
              price: null,
              available: null,
              quantity: p.quantity,
              error: "SKU not found in catalog",
              source: "csv",
            });
          }
        }
        return next;
      });
    } catch (err) {
      setCsvError(errorMessage(err));
    }
  }

  async function addAllToCart() {
    const validRows = rows.filter((r): r is QuickOrderRow & { variantId: string } => !!r.variantId && r.quantity > 0);
    if (validRows.length === 0) return;
    setSubmitting(true);
    setSummary(null);
    const merged = new Map<string, number>();
    for (const r of validRows) merged.set(r.variantId, (merged.get(r.variantId) ?? 0) + r.quantity);
    let successCount = 0;
    let failCount = 0;
    const failedVariantIds = new Set<string>();
    for (const [variantId, quantity] of merged) {
      try {
        await addItem(variantId, quantity);
        successCount++;
      } catch {
        failCount++;
        failedVariantIds.add(variantId);
      }
    }
    setRows((prev) => prev.filter((r) => !r.variantId || failedVariantIds.has(r.variantId)));
    setSummary({ successCount, failCount });
    setSubmitting(false);
  }

  const pricedRows = rows.filter((r) => r.variantId && r.price && !r.error);
  const currency = pricedRows[0]?.price?.currency ?? "TRY";
  const estimatedTotal: Money = {
    amount: pricedRows.reduce((sum, r) => sum + r.price!.amount * r.quantity, 0),
    currency,
  };
  const validRowCount = pricedRows.length;
  const errorRowCount = rows.filter((r) => r.error).length;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Quick order</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Search by SKU, barcode, or product name, enter quantities in bulk, or upload a CSV — then add everything to
          your cart at once.
        </p>
      </div>

      <div className="relative">
        <label className="mb-1.5 block text-sm font-medium" htmlFor="quick-order-search">
          Search products or SKUs
        </label>
        <input
          id="quick-order-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Type a SKU, barcode, or product name"
          autoComplete="off"
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        />
        {open && (
          <div className="absolute z-10 mt-1 max-h-80 w-full overflow-y-auto rounded-md border bg-background shadow-popover">
            {searching && <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>}
            {!searching && results.length === 0 && (
              <p className="px-3 py-2 text-sm text-muted-foreground">No matches.</p>
            )}
            {results.map((r) => (
              <button
                key={r.variantId}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectResult(r);
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {r.productTitle}
                    {r.variantTitle && r.variantTitle !== "Default" ? ` — ${r.variantTitle}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">{r.sku ?? "No SKU"}</p>
                </div>
                <span className="shrink-0 font-medium">{formatMoney(r.price)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-dashed p-4">
        <p className="text-sm font-medium">Upload a CSV</p>
        <p className="text-xs text-muted-foreground">
          Columns: sku, quantity (a header row is optional). Unmatched SKUs are added as errors, not dropped.
        </p>
        <input type="file" accept=".csv,text/csv" onChange={(e) => void onCsvChange(e)} className="text-sm" />
        {csvError && <p className="text-sm text-destructive">{csvError}</p>}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            Order list ({rows.length}){errorRowCount > 0 ? ` — ${errorRowCount} need attention` : ""}
          </h2>
          <button type="button" onClick={addEmptyRow} className="text-xs font-medium text-primary hover:underline">
            + Add row
          </button>
        </div>
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Product</th>
                <th className="px-3 py-2 text-left font-medium">SKU</th>
                <th className="px-3 py-2 text-right font-medium">Price</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                <th className="px-3 py-2 text-right font-medium">Line total</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    No rows yet. Search above, add a row, or upload a CSV.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.key} className={row.error ? "bg-destructive/5" : undefined}>
                  <td className="px-3 py-2">
                    {row.variantId ? (
                      <div className="min-w-0">
                        <p className="truncate font-medium">{row.productTitle}</p>
                        {row.variantTitle && row.variantTitle !== "Default" && (
                          <p className="text-xs text-muted-foreground">{row.variantTitle}</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-destructive">{row.error ?? "Unresolved"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.variantId ? (
                      <span className="text-muted-foreground">{row.sku || "—"}</span>
                    ) : (
                      <input
                        value={row.sku}
                        onChange={(e) => updateRowSku(row.key, e.target.value)}
                        onBlur={() => void resolveRow(row.key)}
                        onKeyDown={(e) => onSkuKeyDown(row.key, e)}
                        placeholder="Type a SKU, press Enter"
                        className="h-8 w-36 rounded-md border border-input bg-background px-2 text-sm"
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.price ? formatMoney(row.price) : "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min={1}
                      value={row.quantity}
                      onChange={(e) => updateRowQuantity(row.key, Math.max(1, Number(e.target.value) || 1))}
                      className="h-8 w-16 rounded-md border border-input bg-background px-2 text-right text-sm"
                    />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {row.price ? formatMoney({ amount: row.price.amount * row.quantity, currency: row.price.currency }) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      className="text-xs text-muted-foreground hover:text-destructive"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col items-end gap-3 border-t pt-4">
        <div className="flex items-center gap-6">
          <span className="text-sm text-muted-foreground">
            Estimated total ({validRowCount} item{validRowCount === 1 ? "" : "s"})
          </span>
          <span className="text-lg font-semibold tabular-nums">{formatMoney(estimatedTotal)}</span>
        </div>
        {summary && (
          <p className={summary.failCount > 0 ? "text-sm text-destructive" : "text-sm text-emerald-600"}>
            {summary.successCount > 0 && `Added ${summary.successCount} item${summary.successCount === 1 ? "" : "s"} to your cart.`}
            {summary.failCount > 0 &&
              ` ${summary.failCount} item${summary.failCount === 1 ? "" : "s"} failed to add — check the order list and try again.`}
          </p>
        )}
        <button
          type="button"
          onClick={() => void addAllToCart()}
          disabled={submitting || validRowCount === 0}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Adding…" : "Add all to cart"}
        </button>
      </div>
    </div>
  );
}
