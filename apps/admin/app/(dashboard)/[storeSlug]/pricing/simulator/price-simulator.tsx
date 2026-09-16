"use client";

import type {
  CompanyCandidate,
  InventoryVariantCandidate,
  PricedItem,
  PricingQuote,
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
  DataGrid,
  FormField,
  Input,
  type DataGridColumn,
} from "@ocean/ui";
import { useState } from "react";

import { CompanyPicker, LocationSelect, VariantPicker, variantLabel } from "@/components/pickers";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { useSubmit } from "@/lib/use-submit";

interface Line {
  variant: InventoryVariantCandidate;
  quantity: number;
}

const SOURCE_LABEL: Record<PricedItem["source"], string> = {
  contract: "Contract",
  price_list: "Price list",
  volume: "Volume tier",
  base: "Base",
};

// Runs the same quote the storefront and checkout will use, so staff can see exactly what a
// buyer pays before the buyer does.
export function PriceSimulator({ storeId }: { storeId: string }) {
  const submit = useSubmit();
  const [company, setCompany] = useState<CompanyCandidate | null>(null);
  const [locationId, setLocationId] = useState("");
  const [variant, setVariant] = useState<InventoryVariantCandidate | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [lines, setLines] = useState<Line[]>([]);
  const [quote, setQuote] = useState<PricingQuote | null>(null);

  function addLine() {
    if (!variant) return;
    const qty = Math.max(1, Number(quantity) || 1);
    setLines((prev) => [
      ...prev.filter((l) => l.variant.variantId !== variant.variantId),
      { variant, quantity: qty },
    ]);
    setVariant(null);
    setQuantity("1");
  }

  async function run() {
    const res = await submit.run(() =>
      api<{ data: PricingQuote }>(`/stores/${storeId}/pricing/quote`, {
        body: {
          buyer: locationId
            ? { companyLocationId: locationId }
            : company
              ? { companyId: company.id }
              : {},
          items: lines.map((l) => ({ variantId: l.variant.variantId, quantity: l.quantity })),
        },
      }),
    );
    if (res) setQuote(res.data);
  }

  const byVariant = new Map(lines.map((l) => [l.variant.variantId, l.variant]));
  const columns: DataGridColumn<PricedItem>[] = [
    {
      key: "variant",
      header: "Variant",
      cell: (i) => {
        const v = byVariant.get(i.variantId);
        return (
          <div>
            <div className="font-medium">{v ? variantLabel(v) : i.variantId}</div>
            {!i.visible && <Badge variant="warning">Not in buyer&apos;s catalog</Badge>}
          </div>
        );
      },
    },
    {
      key: "qty",
      header: "Qty",
      className: "text-right",
      cell: (i) => <span className="tabular-nums">{i.quantity}</span>,
    },
    {
      key: "base",
      header: "Base",
      className: "text-right",
      cell: (i) => (
        <span className="tabular-nums text-muted-foreground">{formatMoney(i.basePrice)}</span>
      ),
    },
    {
      key: "unit",
      header: "Unit price",
      className: "text-right",
      cell: (i) => <span className="tabular-nums font-medium">{formatMoney(i.unitPrice)}</span>,
    },
    {
      key: "total",
      header: "Line total",
      className: "text-right",
      cell: (i) => <span className="tabular-nums">{formatMoney(i.lineTotal)}</span>,
    },
    {
      key: "source",
      header: "Why",
      cell: (i) => (
        <div className="flex flex-col gap-1 text-xs">
          <Badge variant={i.source === "base" ? "secondary" : "default"}>
            {SOURCE_LABEL[i.source]}
          </Badge>
          {i.appliedTier && (
            <span className="text-muted-foreground">tier from {i.appliedTier.minQuantity}</span>
          )}
          {i.tiers.length > 0 && (
            <span className="text-muted-foreground">
              breaks:{" "}
              {i.tiers.map((t) => `${t.minQuantity}+ ${formatMoney(t.unitPrice)}`).join(", ")}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "rule",
      header: "Quantity rule",
      cell: (i) =>
        i.quantityRule.ok ? (
          <span className="text-muted-foreground">OK</span>
        ) : (
          <div className="text-xs">
            <Badge variant="destructive">Invalid</Badge>
            <div className="text-muted-foreground">
              {i.quantityRule.message}
              {i.quantityRule.suggestedQuantity !== null &&
                ` Try ${i.quantityRule.suggestedQuantity}.`}
            </div>
          </div>
        ),
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_2fr] lg:items-start">
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Buyer</CardTitle>
            <CardDescription>Leave empty to price as an anonymous shopper.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <CompanyPicker
              storeId={storeId}
              value={company}
              onChange={(c) => {
                setCompany(c);
                setLocationId("");
              }}
            />
            <LocationSelect
              storeId={storeId}
              companyId={company?.id ?? null}
              value={locationId}
              onChange={setLocationId}
            />
            {company && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCompany(null);
                  setLocationId("");
                }}
              >
                Clear buyer
              </Button>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Items</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <VariantPicker storeId={storeId} value={variant} onChange={setVariant} />
            <div className="flex items-end gap-2">
              <FormField id="sim-qty" label="Quantity" className="flex-1">
                <Input
                  id="sim-qty"
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </FormField>
              <Button type="button" variant="outline" disabled={!variant} onClick={addLine}>
                Add
              </Button>
            </div>
            {lines.length > 0 && (
              <ul className="flex flex-col divide-y text-sm">
                {lines.map((l) => (
                  <li
                    key={l.variant.variantId}
                    className="flex items-center justify-between py-1.5"
                  >
                    <span>
                      {variantLabel(l.variant)}{" "}
                      <span className="text-muted-foreground">× {l.quantity}</span>
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setLines((prev) => prev.filter((x) => x !== l))}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <Button
              type="button"
              onClick={() => void run()}
              loading={submit.pending}
              disabled={lines.length === 0}
            >
              Calculate
            </Button>
          </CardContent>
        </Card>
      </div>
      <div className="flex flex-col gap-4">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        {quote && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>Currency {quote.currency}</span>
            <span>
              · {quote.catalogRestricted ? "Catalog-restricted buyer" : "Full assortment"}
            </span>
            <span className="ml-auto text-base font-semibold text-foreground">
              Subtotal {formatMoney(quote.subtotal)}
            </span>
          </div>
        )}
        <DataGrid
          columns={columns}
          rows={quote?.items ?? []}
          rowKey={(i) => `${i.variantId}:${i.quantity}`}
          empty={{ title: "No quote yet", description: "Pick a buyer, add items and calculate." }}
        />
      </div>
    </div>
  );
}
