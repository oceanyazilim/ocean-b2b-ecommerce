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
  Select,
} from "@ocean/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

const CURRENCIES = ["TRY", "USD", "EUR", "GBP"];
const LOCALES = [
  { value: "tr", label: "Türkçe" },
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
];
const BUSINESS_TYPES = [
  { value: "wholesale", label: "Wholesale" },
  { value: "b2b", label: "B2B" },
  { value: "dtc", label: "Direct to consumer" },
  { value: "hybrid", label: "Hybrid (B2B + DTC)" },
];

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function StoreForm({
  organizationId,
  organizationName,
  canCreate,
}: {
  organizationId: string;
  organizationName: string;
  canCreate: boolean;
}) {
  const router = useRouter();
  const { pending, error, fieldErrors, run } = useSubmit();
  const [name, setName] = useState("");
  const [defaultCurrency, setCurrency] = useState("TRY");
  const [defaultLocale, setLocale] = useState("tr");
  const [businessType, setBusinessType] = useState("wholesale");
  const [timezone, setTimezone] = useState(detectTimezone);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await run(() =>
      api<{ data: StoreSummary }>(`/organizations/${organizationId}/stores`, {
        body: { name, defaultCurrency, defaultLocale, timezone, businessType },
      }),
    );
    if (res) {
      router.replace(`/${res.data.slug}`);
      router.refresh();
    }
  }

  return (
    <Card>
      <CardHeader>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Step 2 of 2 · {organizationName}
        </p>
        <CardTitle>Create your first store</CardTitle>
        <CardDescription>You can change these settings later and add more stores.</CardDescription>
      </CardHeader>
      <CardContent>
        {!canCreate ? (
          <Alert variant="warning">
            Your role in {organizationName} cannot create stores. Ask an organization owner or
            admin.
          </Alert>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            {error && <Alert variant="error">{error}</Alert>}
            <FormField id="name" label="Store name" error={fieldErrors["name"]}>
              <Input
                id="name"
                required
                placeholder="ACME Wholesale"
                value={name}
                onChange={(e) => setName(e.target.value)}
                invalid={!!fieldErrors["name"]}
              />
            </FormField>
            <FormField id="businessType" label="Business type" error={fieldErrors["businessType"]}>
              <Select
                id="businessType"
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
              >
                {BUSINESS_TYPES.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField id="currency" label="Currency" error={fieldErrors["defaultCurrency"]}>
                <Select
                  id="currency"
                  value={defaultCurrency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField id="locale" label="Language" error={fieldErrors["defaultLocale"]}>
                <Select
                  id="locale"
                  value={defaultLocale}
                  onChange={(e) => setLocale(e.target.value)}
                >
                  {LOCALES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            <FormField id="timezone" label="Time zone" error={fieldErrors["timezone"]}>
              <Input
                id="timezone"
                required
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                invalid={!!fieldErrors["timezone"]}
              />
            </FormField>
            <Button type="submit" loading={pending}>
              Create store
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
