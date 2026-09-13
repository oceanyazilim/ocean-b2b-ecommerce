"use client";

import type { StoreSummary } from "@ocean/types";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormField,
  Input,
} from "@ocean/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

interface Values {
  id: string;
  name: string;
  defaultCurrency: string;
  defaultLocale: string;
  timezone: string;
}

export function GeneralSettingsForm({ store, editable }: { store: Values; editable: boolean }) {
  const router = useRouter();
  const { pending, error, fieldErrors, run } = useSubmit();
  const [values, setValues] = useState(store);
  const [saved, setSaved] = useState(false);

  const dirty =
    values.name !== store.name ||
    values.defaultCurrency !== store.defaultCurrency ||
    values.defaultLocale !== store.defaultLocale ||
    values.timezone !== store.timezone;

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setSaved(false);
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await run(() =>
      api<{ data: StoreSummary }>(`/stores/${store.id}`, {
        method: "PATCH",
        body: {
          name: values.name,
          defaultCurrency: values.defaultCurrency.toUpperCase(),
          defaultLocale: values.defaultLocale,
          timezone: values.timezone,
        },
      }),
    );
    if (res) {
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Store details</CardTitle>
        <CardDescription>Defaults used across pricing, checkout and reporting.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex max-w-lg flex-col gap-4" noValidate>
          {error && <Alert variant="error">{error}</Alert>}
          {saved && !dirty && <Alert variant="success">Settings saved.</Alert>}
          {!editable && (
            <Alert variant="info">You can view these settings but not change them.</Alert>
          )}
          <FormField id="name" label="Store name" error={fieldErrors["name"]}>
            <Input
              id="name"
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              disabled={!editable}
              invalid={!!fieldErrors["name"]}
            />
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              id="currency"
              label="Currency (ISO 4217)"
              error={fieldErrors["defaultCurrency"]}
            >
              <Input
                id="currency"
                maxLength={3}
                value={values.defaultCurrency}
                onChange={(e) => set("defaultCurrency", e.target.value.toUpperCase())}
                disabled={!editable}
                invalid={!!fieldErrors["defaultCurrency"]}
              />
            </FormField>
            <FormField id="locale" label="Language" error={fieldErrors["defaultLocale"]}>
              <Input
                id="locale"
                value={values.defaultLocale}
                onChange={(e) => set("defaultLocale", e.target.value)}
                disabled={!editable}
                invalid={!!fieldErrors["defaultLocale"]}
              />
            </FormField>
          </div>
          <FormField id="timezone" label="Time zone" error={fieldErrors["timezone"]}>
            <Input
              id="timezone"
              value={values.timezone}
              onChange={(e) => set("timezone", e.target.value)}
              disabled={!editable}
              invalid={!!fieldErrors["timezone"]}
            />
          </FormField>
          {editable && (
            <div>
              <Button type="submit" loading={pending} disabled={!dirty}>
                Save changes
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
