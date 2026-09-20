"use client";

import type {
  InventoryVariantCandidate,
  PricingScope,
  VolumeRuleSummary,
  VolumeTierType,
} from "@ocean/types";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  DataGrid,
  Dialog,
  FormField,
  Input,
  Select,
  type DataGridColumn,
} from "@ocean/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { VariantPicker, variantLabel } from "@/components/pickers";
import { api } from "@/lib/api";
import { formatMoney, inputToMinor, minorToInput } from "@/lib/money";
import { useSubmit } from "@/lib/use-submit";

type Editing = { kind: "new" } | { kind: "edit"; rule: VolumeRuleSummary } | null;
interface TierDraft {
  minQuantity: string;
  value: string;
}

// Spec format: "1-9 units €100, 10-49 €92, 50-99 €85, 100+ €78". VolumePricingRule only stores
// each tier's start (minQuantity); the upper bound of a range is implied by the next tier's
// start minus one, and the last tier is open-ended ("100+") — computed here for display only.
function tierRangeLabel(tiers: { minQuantity: number }[], index: number): string {
  const next = tiers[index + 1];
  return next ? `${tiers[index]!.minQuantity}–${next.minQuantity - 1}` : `${tiers[index]!.minQuantity}+`;
}

function describeTier(
  rule: VolumeRuleSummary,
  tier: { minQuantity: number; value: number },
  index: number,
  currency: string,
) {
  const value =
    rule.tierType === "fixed_price"
      ? formatMoney({ amount: tier.value, currency })
      : `${(tier.value / 100).toFixed(tier.value % 100 === 0 ? 0 : 2)}% off`;
  return `${tierRangeLabel(rule.tiers, index)} → ${value}`;
}

export function VolumeRules({
  storeId,
  currency,
  rules,
  priceLists,
  collections,
  canWrite,
}: {
  storeId: string;
  currency: string;
  rules: VolumeRuleSummary[];
  priceLists: { id: string; name: string }[];
  collections: { id: string; title: string }[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<VolumeRuleSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const action = useSubmit();
  const base = `/stores/${storeId}/pricing/volume-rules`;

  async function mutate(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    const ok = await action.run(fn);
    setBusyId(null);
    if (ok !== undefined) router.refresh();
    return ok !== undefined;
  }

  const columns: DataGridColumn<VolumeRuleSummary>[] = [
    {
      key: "name",
      header: "Rule",
      cell: (r) => (
        <div>
          <div className="font-medium">{r.name}</div>
          <div className="text-xs text-muted-foreground">{r.scopeLabel}</div>
        </div>
      ),
    },
    {
      key: "tiers",
      header: "Tiers",
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.tiers.map((t, i) => (
            <Badge key={t.minQuantity} variant="outline">
              {describeTier(r, t, i, currency)}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: "list",
      header: "Price list",
      cell: (r) => <span className="text-muted-foreground">{r.priceList?.name ?? "Any"}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <Badge variant={r.isActive ? "success" : "secondary"}>
          {r.isActive ? "Active" : "Paused"}
        </Badge>
      ),
    },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "",
            className: "text-right",
            cell: (r: VolumeRuleSummary) => (
              <div className="flex justify-end gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing({ kind: "edit", rule: r })}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busyId === r.id}
                  onClick={() =>
                    void mutate(r.id, () =>
                      api(`${base}/${r.id}`, { method: "PATCH", body: { isActive: !r.isActive } }),
                    )
                  }
                >
                  {r.isActive ? "Pause" : "Activate"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(r)}>
                  Delete
                </Button>
              </div>
            ),
          } satisfies DataGridColumn<VolumeRuleSummary>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Quantity breaks on top of the buyer&apos;s list price. The most specific rule wins:
          variant, then product, collection, whole store.
        </p>
        {canWrite && <Button onClick={() => setEditing({ kind: "new" })}>New rule</Button>}
      </div>
      {action.error && <Alert variant="error">{action.error}</Alert>}
      <DataGrid
        columns={columns}
        rows={rules}
        rowKey={(r) => r.id}
        empty={{
          title: "No volume pricing yet",
          description: "Add quantity breaks, e.g. 1–9 units full price, 10–49 8% off, 50+ 15% off.",
          action: canWrite ? (
            <Button onClick={() => setEditing({ kind: "new" })}>Add first rule</Button>
          ) : undefined,
        }}
      />
      <RuleDialog
        storeId={storeId}
        base={base}
        currency={currency}
        priceLists={priceLists}
        collections={collections}
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => router.refresh()}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name ?? "rule"}?`}
        description="Buyers immediately lose these quantity breaks."
        confirmLabel="Delete"
        destructive
        pending={busyId === deleting?.id}
        onConfirm={async () => {
          if (!deleting) return;
          const ok = await mutate(deleting.id, () =>
            api(`${base}/${deleting.id}`, { method: "DELETE" }),
          );
          if (ok) setDeleting(null);
        }}
      />
    </div>
  );
}

function RuleDialog({
  storeId,
  base,
  currency,
  priceLists,
  collections,
  editing,
  onClose,
  onSaved,
}: {
  storeId: string;
  base: string;
  currency: string;
  priceLists: { id: string; name: string }[];
  collections: { id: string; title: string }[];
  editing: Editing;
  onClose: () => void;
  onSaved: () => void;
}) {
  const submit = useSubmit();
  const { reset } = submit;
  const current = editing?.kind === "edit" ? editing.rule : null;
  const [name, setName] = useState("");
  const [scope, setScope] = useState<PricingScope>("product");
  const [variant, setVariant] = useState<InventoryVariantCandidate | null>(null);
  const [collectionId, setCollectionId] = useState("");
  const [priceListId, setPriceListId] = useState("");
  const [tierType, setTierType] = useState<VolumeTierType>("percent_off");
  const [tiers, setTiers] = useState<TierDraft[]>([{ minQuantity: "10", value: "" }]);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    reset();
    setName(current?.name ?? "");
    setScope(current?.scope ?? "product");
    setVariant(null);
    setCollectionId(current?.scope === "collection" ? (current.scopeId ?? "") : "");
    setPriceListId(current?.priceList?.id ?? "");
    setTierType(current?.tierType ?? "percent_off");
    setTiers(
      current
        ? current.tiers.map((t) => ({
            minQuantity: String(t.minQuantity),
            value:
              current.tierType === "fixed_price"
                ? minorToInput(t.value)
                : (t.value / 100).toString(),
          }))
        : [{ minQuantity: "10", value: "" }],
    );
    setIsActive(current?.isActive ?? true);
  }, [current, editing, reset]);

  function setTier(i: number, patch: Partial<TierDraft>) {
    setTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsedTiers = tiers.map((t) => ({
      minQuantity: Number(t.minQuantity) || 0,
      value:
        tierType === "fixed_price"
          ? (inputToMinor(t.value) ?? 0)
          : Math.round((Number(t.value.replace(",", ".")) || 0) * 100),
    }));
    const scopeId =
      scope === "store"
        ? null
        : scope === "collection"
          ? collectionId || null
          : (variant?.productId ?? null);
    const body = current
      ? { name, priceListId: priceListId || null, tierType, tiers: parsedTiers, isActive }
      : {
          name,
          scope,
          scopeId: scope === "variant" ? (variant?.variantId ?? null) : scopeId,
          priceListId: priceListId || null,
          tierType,
          tiers: parsedTiers,
          isActive,
        };
    const res = await submit.run(() =>
      current ? api(`${base}/${current.id}`, { method: "PATCH", body }) : api(base, { body }),
    );
    if (res !== undefined) {
      onSaved();
      onClose();
    }
  }

  const needsPick =
    !current &&
    (scope === "variant" || scope === "product"
      ? !variant
      : scope === "collection"
        ? !collectionId
        : false);

  return (
    <Dialog
      open={editing !== null}
      onClose={onClose}
      title={current ? `Edit ${current.name}` : "New volume pricing rule"}
      className="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="volume-rule-form"
            loading={submit.pending}
            disabled={needsPick}
          >
            {current ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <form
        id="volume-rule-form"
        onSubmit={(e) => void onSubmit(e)}
        className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1"
      >
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        <FormField id="vr-name" label="Name" error={submit.fieldErrors.name}>
          <Input
            id="vr-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
            autoFocus
          />
        </FormField>
        {current ? (
          <p className="text-sm text-muted-foreground">Applies to: {current.scopeLabel}</p>
        ) : (
          <>
            <FormField id="vr-scope" label="Applies to">
              <Select
                id="vr-scope"
                value={scope}
                onChange={(e) => setScope(e.target.value as PricingScope)}
              >
                <option value="product">One product (all variants)</option>
                <option value="variant">One variant</option>
                <option value="collection">A collection</option>
                <option value="store">Whole store</option>
              </Select>
            </FormField>
            {(scope === "variant" || scope === "product") && (
              <VariantPicker
                storeId={storeId}
                value={variant}
                onChange={setVariant}
                label={scope === "variant" ? "Variant" : "Pick any variant of the product"}
                error={submit.fieldErrors.scopeId}
              />
            )}
            {scope === "product" && variant && (
              <p className="text-xs text-muted-foreground">
                Product: {variantLabel(variant).split(" · ")[0]}
              </p>
            )}
            {scope === "collection" && (
              <FormField id="vr-collection" label="Collection" error={submit.fieldErrors.scopeId}>
                <Select
                  id="vr-collection"
                  value={collectionId}
                  onChange={(e) => setCollectionId(e.target.value)}
                >
                  <option value="">Choose a collection</option>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <FormField id="vr-type" label="Tier type">
            <Select
              id="vr-type"
              value={tierType}
              onChange={(e) => setTierType(e.target.value as VolumeTierType)}
            >
              <option value="percent_off">Percent off</option>
              <option value="fixed_price">Fixed unit price</option>
            </Select>
          </FormField>
          <FormField id="vr-list" label="Only with price list" hint="Blank = any buyer">
            <Select
              id="vr-list"
              value={priceListId}
              onChange={(e) => setPriceListId(e.target.value)}
            >
              <option value="">Any</option>
              {priceLists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Tiers</legend>
          {submit.fieldErrors.tiers && (
            <p role="alert" className="text-xs text-destructive">
              {submit.fieldErrors.tiers}
            </p>
          )}
          {tiers.map((t, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <FormField id={`tier-min-${i}`} label={i === 0 ? "From quantity" : ""}>
                <Input
                  id={`tier-min-${i}`}
                  type="number"
                  min={1}
                  value={t.minQuantity}
                  onChange={(e) => setTier(i, { minQuantity: e.target.value })}
                  required
                />
              </FormField>
              <FormField
                id={`tier-val-${i}`}
                label={
                  i === 0
                    ? tierType === "fixed_price"
                      ? `Unit price (${currency})`
                      : "Percent off"
                    : ""
                }
              >
                <Input
                  id={`tier-val-${i}`}
                  inputMode="decimal"
                  value={t.value}
                  onChange={(e) => setTier(i, { value: e.target.value })}
                  required
                />
              </FormField>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={tiers.length === 1}
                onClick={() => setTiers((prev) => prev.filter((_, idx) => idx !== i))}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="self-start"
            disabled={tiers.length >= 20}
            onClick={() => setTiers((prev) => [...prev, { minQuantity: "", value: "" }])}
          >
            Add tier
          </Button>
        </fieldset>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>
      </form>
    </Dialog>
  );
}
