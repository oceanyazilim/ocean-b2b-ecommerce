"use client";

import {
  METAFIELD_OWNER_TYPES,
  METAFIELD_TYPES,
  type MetafieldDefinitionSummary,
  type MetafieldOwnerType,
  type MetafieldType,
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
  ConfirmDialog,
  EmptyState,
  FormField,
  Input,
  Select,
  Tabs,
} from "@ocean/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { api, errorMessage } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

export function MetafieldDefinitions({
  storeId,
  definitions,
  canWrite,
}: {
  storeId: string;
  definitions: MetafieldDefinitionSummary[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const { pending, error, fieldErrors, run } = useSubmit();
  const [ownerType, setOwnerType] = useState<MetafieldOwnerType>("product");
  const [name, setName] = useState("");
  const [namespace, setNamespace] = useState("custom");
  const [key, setKey] = useState("");
  const [type, setType] = useState<MetafieldType>("single_line_text");
  const [choices, setChoices] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState<MetafieldDefinitionSummary | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const visible = definitions.filter((d) => d.ownerType === ownerType);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validations: Record<string, unknown> = {};
    if (choices.trim())
      validations.choices = choices
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
    if (min.trim()) validations.min = Number(min);
    if (max.trim()) validations.max = Number(max);
    const ok = await run(() =>
      api(`/stores/${storeId}/metafield-definitions`, {
        body: { ownerType, namespace, key, name, type, validations },
      }),
    );
    if (ok !== undefined) {
      setName("");
      setKey("");
      setChoices("");
      setMin("");
      setMax("");
      setShowForm(false);
      router.refresh();
    }
  }

  async function remove() {
    if (!deleting) return;
    setRowError(null);
    try {
      await api(`/stores/${storeId}/metafield-definitions/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      router.refresh();
    } catch (err) {
      setRowError(errorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Metafield definitions</h2>
          <p className="text-sm text-muted-foreground">
            Custom, validated data on products, collections, companies and more.
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Close" : "Add definition"}
          </Button>
        )}
      </div>

      {showForm && canWrite && (
        <Card>
          <CardHeader>
            <CardTitle>New definition</CardTitle>
            <CardDescription>
              Namespace and key form the unique identifier, e.g. custom.material.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
              {error && (
                <Alert variant="error" className="sm:col-span-2">
                  {error}
                </Alert>
              )}
              <FormField id="ownerType" label="Applies to" error={fieldErrors["ownerType"]}>
                <Select
                  id="ownerType"
                  value={ownerType}
                  onChange={(e) => setOwnerType(e.target.value as MetafieldOwnerType)}
                >
                  {METAFIELD_OWNER_TYPES.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField id="name" label="Name" error={fieldErrors["name"]}>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  invalid={!!fieldErrors["name"]}
                />
              </FormField>
              <FormField id="namespace" label="Namespace" error={fieldErrors["namespace"]}>
                <Input
                  id="namespace"
                  value={namespace}
                  onChange={(e) => setNamespace(e.target.value)}
                  invalid={!!fieldErrors["namespace"]}
                />
              </FormField>
              <FormField
                id="key"
                label="Key"
                hint="lowercase, numbers, underscores"
                error={fieldErrors["key"]}
              >
                <Input
                  id="key"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  invalid={!!fieldErrors["key"]}
                />
              </FormField>
              <FormField id="type" label="Type" error={fieldErrors["type"]}>
                <Select
                  id="type"
                  value={type}
                  onChange={(e) => setType(e.target.value as MetafieldType)}
                >
                  {METAFIELD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace(/_/g, " ")}
                    </option>
                  ))}
                </Select>
              </FormField>
              {type === "single_line_text" && (
                <FormField
                  id="choices"
                  label="Allowed choices"
                  hint="Comma separated; leave empty for free text"
                >
                  <Input
                    id="choices"
                    value={choices}
                    onChange={(e) => setChoices(e.target.value)}
                  />
                </FormField>
              )}
              {(type === "integer" || type === "decimal") && (
                <>
                  <FormField id="min" label="Minimum">
                    <Input
                      id="min"
                      inputMode="decimal"
                      value={min}
                      onChange={(e) => setMin(e.target.value)}
                    />
                  </FormField>
                  <FormField id="max" label="Maximum">
                    <Input
                      id="max"
                      inputMode="decimal"
                      value={max}
                      onChange={(e) => setMax(e.target.value)}
                    />
                  </FormField>
                </>
              )}
              <div className="sm:col-span-2">
                <Button type="submit" loading={pending}>
                  Create definition
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Tabs
        aria-label="Owner type"
        value={ownerType}
        onChange={setOwnerType}
        items={METAFIELD_OWNER_TYPES.map((o) => ({
          value: o,
          label: o,
          count: definitions.filter((d) => d.ownerType === o).length,
        }))}
      />

      {rowError && <Alert variant="error">{rowError}</Alert>}

      <Card>
        <CardContent className={visible.length ? "p-0" : "pt-6"}>
          {visible.length === 0 ? (
            <EmptyState
              title={`No ${ownerType} metafields`}
              description="Definitions describe the extra fields merchants can fill in."
            />
          ) : (
            <ul className="divide-y">
              {visible.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-4 px-6 py-3 text-sm"
                >
                  <div>
                    <div className="font-medium">
                      {d.name}{" "}
                      <Badge variant="outline" className="ml-1 font-mono text-[11px]">
                        {d.namespace}.{d.key}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {d.type.replace(/_/g, " ")}
                      {d.validations.choices?.length
                        ? ` · ${d.validations.choices.length} choices`
                        : ""}
                      {d.validations.min !== undefined || d.validations.max !== undefined
                        ? ` · ${d.validations.min ?? "−∞"} to ${d.validations.max ?? "∞"}`
                        : ""}
                    </div>
                  </div>
                  {canWrite && (
                    <Button variant="ghost" size="sm" onClick={() => setDeleting(d)}>
                      Delete
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title={`Delete "${deleting?.name}"?`}
        description="All values stored under this definition are deleted as well."
        confirmLabel="Delete"
        destructive
      />
    </div>
  );
}
