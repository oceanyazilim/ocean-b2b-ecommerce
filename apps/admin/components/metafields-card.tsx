"use client";

import type { MetafieldDefinitionSummary, MetafieldValue } from "@ocean/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  Select,
  Textarea,
} from "@ocean/ui";

import { api } from "@/lib/api";

export type MetafieldDrafts = Record<string, string>;

export function metafieldDrafts(values: MetafieldValue[]): MetafieldDrafts {
  return Object.fromEntries(
    values.map((m) => [
      `${m.namespace}.${m.key}`,
      typeof m.value === "string" ? m.value : JSON.stringify(m.value),
    ]),
  );
}

// PATCHes every defined metafield for one owner; blank = clear.
export async function saveMetafields(
  path: string,
  definitions: MetafieldDefinitionSummary[],
  drafts: MetafieldDrafts,
): Promise<void> {
  if (definitions.length === 0) return;
  const entries = definitions.map((d) => {
    const raw = drafts[`${d.namespace}.${d.key}`];
    let value: unknown = raw === undefined || raw === "" ? null : raw;
    if (value !== null && d.type === "boolean") value = raw === "true";
    if (value !== null && (d.type === "integer" || d.type === "decimal")) value = Number(raw);
    return { namespace: d.namespace, key: d.key, value };
  });
  await api(path, { method: "PATCH", body: { metafields: entries } });
}

export function MetafieldsCard({
  definitions,
  values,
  onChange,
  error,
  readOnly = false,
}: {
  definitions: MetafieldDefinitionSummary[];
  values: MetafieldDrafts;
  onChange: (next: MetafieldDrafts) => void;
  error?: string | undefined;
  readOnly?: boolean;
}) {
  if (definitions.length === 0) return null;
  const set = (k: string, v: string) => onChange({ ...values, [k]: v });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Metafields</CardTitle>
        <CardDescription>Custom data defined under Settings → Metafields.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {definitions.map((d) => {
          const k = `${d.namespace}.${d.key}`;
          const value = values[k] ?? "";
          const id = `mf-${k}`;
          return (
            <FormField
              key={d.id}
              id={id}
              label={d.name}
              hint={`${k} · ${d.type.replace(/_/g, " ")}`}
            >
              {d.type === "boolean" ? (
                <Select
                  id={id}
                  value={value}
                  onChange={(e) => set(k, e.target.value)}
                  disabled={readOnly}
                >
                  <option value="">—</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </Select>
              ) : d.validations.choices?.length ? (
                <Select
                  id={id}
                  value={value}
                  onChange={(e) => set(k, e.target.value)}
                  disabled={readOnly}
                >
                  <option value="">—</option>
                  {d.validations.choices.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              ) : d.type === "multi_line_text" || d.type === "json" ? (
                <Textarea
                  id={id}
                  rows={3}
                  value={value}
                  onChange={(e) => set(k, e.target.value)}
                  disabled={readOnly}
                  invalid={!!error}
                />
              ) : (
                <Input
                  id={id}
                  type={d.type === "date" ? "date" : "text"}
                  inputMode={d.type === "integer" || d.type === "decimal" ? "decimal" : undefined}
                  value={value}
                  onChange={(e) => set(k, e.target.value)}
                  disabled={readOnly}
                  invalid={!!error}
                />
              )}
            </FormField>
          );
        })}
        {error && (
          <p role="alert" className="text-xs text-destructive sm:col-span-2">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
