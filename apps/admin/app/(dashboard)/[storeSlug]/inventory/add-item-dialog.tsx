"use client";

import type { InventoryItemDetail, InventoryVariantCandidate } from "@ocean/types";
import { Alert, Badge, Button, Dialog, FormField, Input, Spinner, Tabs } from "@ocean/ui";
import { useEffect, useState } from "react";

import { api, errorMessage } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

type Source = "catalog" | "manual";

export function AddItemDialog({
  storeId,
  open,
  onClose,
  onCreated,
}: {
  storeId: string;
  open: boolean;
  onClose: () => void;
  onCreated: (itemId: string) => void;
}) {
  const [source, setSource] = useState<Source>("catalog");
  const [q, setQ] = useState("");
  const [candidates, setCandidates] = useState<InventoryVariantCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [sku, setSku] = useState("");
  const [upc, setUpc] = useState("");
  const submit = useSubmit();

  useEffect(() => {
    if (!open || source !== "catalog") return;
    const handle = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const res = await api<{ data: InventoryVariantCandidate[] }>(
          `/stores/${storeId}/inventory/variants?q=${encodeURIComponent(q.trim())}&limit=30`,
        );
        setCandidates(res.data);
      } catch (err) {
        setSearchError(errorMessage(err));
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [storeId, q, open, source]);

  function close() {
    setQ("");
    setVariantId(null);
    setSku("");
    setUpc("");
    submit.reset();
    onClose();
  }

  async function onSubmit() {
    const body =
      source === "catalog"
        ? { productVariantId: variantId }
        : { sku: sku.trim() || null, upc: upc.trim() || null };
    const res = await submit.run(() =>
      api<{ data: InventoryItemDetail }>(`/stores/${storeId}/inventory/items`, { body }),
    );
    if (res) {
      onCreated(res.data.id);
      close();
    }
  }

  const canSubmit = source === "catalog" ? !!variantId : !!(sku.trim() || upc.trim());

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Track an item"
      description="Pick a catalog variant, or enter a code for goods that are not in the catalog."
      className="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={submit.pending}>
            Cancel
          </Button>
          <Button onClick={() => void onSubmit()} loading={submit.pending} disabled={!canSubmit}>
            Start tracking
          </Button>
        </>
      }
    >
      <Tabs<Source>
        aria-label="Item source"
        value={source}
        onChange={setSource}
        items={[
          { value: "catalog", label: "From catalog" },
          { value: "manual", label: "By SKU or UPC" },
        ]}
      />
      {submit.error && <Alert variant="error">{submit.error}</Alert>}
      {source === "catalog" ? (
        <div className="flex flex-col gap-3">
          <Input
            placeholder="Search products, variants or SKUs"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search variants"
            autoFocus
          />
          {searchError && <Alert variant="error">{searchError}</Alert>}
          <div
            className="max-h-72 overflow-y-auto rounded-md border"
            role="listbox"
            aria-label="Variants"
          >
            {searching && candidates.length === 0 && (
              <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                <Spinner /> Searching…
              </div>
            )}
            {!searching && candidates.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">No variants match.</p>
            )}
            {candidates.map((c) => {
              const selected = c.variantId === variantId;
              return (
                <button
                  key={c.variantId}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={c.tracked}
                  onClick={() => setVariantId(c.variantId)}
                  className={`flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-b-0 disabled:opacity-60 ${
                    selected ? "bg-accent" : "hover:bg-accent/60"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.productTitle}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.variantTitle}
                      {c.sku ? ` · ${c.sku}` : ""}
                    </span>
                  </span>
                  {c.tracked ? (
                    <Badge variant="secondary">Tracked</Badge>
                  ) : selected ? (
                    <Badge>Selected</Badge>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField id="item-sku" label="SKU" error={submit.fieldErrors.sku}>
            <Input
              id="item-sku"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              maxLength={64}
              invalid={!!submit.fieldErrors.sku}
            />
          </FormField>
          <FormField id="item-upc" label="UPC / barcode" error={submit.fieldErrors.upc}>
            <Input
              id="item-upc"
              value={upc}
              onChange={(e) => setUpc(e.target.value)}
              maxLength={64}
              invalid={!!submit.fieldErrors.upc}
            />
          </FormField>
        </div>
      )}
    </Dialog>
  );
}
