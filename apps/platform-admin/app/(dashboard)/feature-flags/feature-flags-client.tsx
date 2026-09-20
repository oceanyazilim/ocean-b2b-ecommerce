"use client";

import type { PlatformCountrySummary, PlatformFeatureFlagSummary } from "@ocean/types";
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
  FormField,
  Input,
} from "@ocean/ui";
import { useState } from "react";

import { api } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

function CreateFlagForm({ onCreated }: { onCreated: (flag: PlatformFeatureFlagSummary) => void }) {
  const { pending, error, fieldErrors, run } = useSubmit();
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [defaultOn, setDefaultOn] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await run(() =>
      api<{ data: PlatformFeatureFlagSummary }>("/feature-flags", {
        body: { key, description: description || undefined, defaultOn },
      }),
    );
    if (!res) return;
    onCreated(res.data);
    setKey("");
    setDescription("");
    setDefaultOn(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New feature flag</CardTitle>
        <CardDescription>Rolled out platform-wide, or targeted at specific orgs/stores below.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          {error && <Alert variant="error">{error}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="key" label="Key" error={fieldErrors["key"]}>
              <Input
                id="key"
                placeholder="beta.new_checkout"
                required
                value={key}
                onChange={(e) => setKey(e.target.value)}
                invalid={!!fieldErrors["key"]}
              />
            </FormField>
            <FormField id="description" label="Description" error={fieldErrors["description"]}>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </FormField>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={defaultOn} onChange={(e) => setDefaultOn(e.target.checked)} />
            Default on for every organization
          </label>
          <div>
            <Button type="submit" loading={pending}>
              Create flag
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function AddTargetForm({
  flagKey,
  countries,
  onChanged,
}: {
  flagKey: string;
  countries: PlatformCountrySummary[];
  onChanged: (flag: PlatformFeatureFlagSummary) => void;
}) {
  const { pending, error, run } = useSubmit();
  const [scope, setScope] = useState<"organization" | "store" | "country">("organization");
  const [id, setId] = useState("");
  const [countryCode, setCountryCode] = useState(countries[0]?.countryCode ?? "");
  const [enabled, setEnabled] = useState(true);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body =
      scope === "organization"
        ? { organizationId: id, enabled }
        : scope === "store"
          ? { storeId: id, enabled }
          : { countryCode, enabled };
    const res = await run(() =>
      api<{ data: PlatformFeatureFlagSummary }>(`/feature-flags/${flagKey}/targets`, {
        method: "PUT",
        body,
      }),
    );
    if (!res) return;
    setId("");
    onChanged(res.data);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2 border-t px-6 py-3">
      {error && (
        <div className="w-full">
          <Alert variant="error">{error}</Alert>
        </div>
      )}
      <select
        value={scope}
        onChange={(e) => setScope(e.target.value as "organization" | "store" | "country")}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
      >
        <option value="organization">Organization ID</option>
        <option value="store">Store ID</option>
        <option value="country">Country</option>
      </select>
      {scope === "country" ? (
        <select
          value={countryCode}
          onChange={(e) => setCountryCode(e.target.value)}
          required
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          {countries.length === 0 && <option value="">No countries configured</option>}
          {countries.map((c) => (
            <option key={c.countryCode} value={c.countryCode}>
              {c.name} ({c.countryCode})
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          required
          placeholder="uuid"
          value={id}
          onChange={(e) => setId(e.target.value)}
          className="h-9 w-72 rounded-md border border-input bg-background px-2 text-sm font-mono text-xs"
        />
      )}
      <label className="flex items-center gap-1.5 text-sm">
        <Checkbox checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Enabled
      </label>
      <Button type="submit" size="sm" variant="outline" loading={pending}>
        Add override
      </Button>
    </form>
  );
}

function FlagCard({
  flag,
  countries,
  onUpdate,
}: {
  flag: PlatformFeatureFlagSummary;
  countries: PlatformCountrySummary[];
  onUpdate: (flag: PlatformFeatureFlagSummary) => void;
}) {
  const { run } = useSubmit();

  async function toggleDefault(defaultOn: boolean) {
    const res = await run(() =>
      api<{ data: PlatformFeatureFlagSummary }>(`/feature-flags/${flag.key}`, {
        method: "PATCH",
        body: { defaultOn },
      }),
    );
    if (res) onUpdate(res.data);
  }

  async function removeTarget(targetId: string) {
    const res = await run(() =>
      api<{ data: PlatformFeatureFlagSummary }>(`/feature-flags/${flag.key}/targets/${targetId}`, {
        method: "DELETE",
      }),
    );
    if (res) onUpdate(res.data);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="font-mono text-base">{flag.key}</CardTitle>
          <CardDescription>{flag.description ?? "No description"}</CardDescription>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={flag.defaultOn} onChange={(e) => toggleDefault(e.target.checked)} />
          Default on
        </label>
      </CardHeader>
      <CardContent className="p-0">
        {flag.targets.length === 0 ? (
          <p className="px-6 py-3 text-sm text-muted-foreground">No org/store overrides.</p>
        ) : (
          <ul className="divide-y">
            {flag.targets.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-6 py-2.5 text-sm">
                <span>
                  {t.organizationName
                    ? `Org: ${t.organizationName}`
                    : t.storeName
                      ? `Store: ${t.storeName}`
                      : `Country: ${t.countryName ?? t.countryCode}`}
                  <Badge variant={t.enabled ? "success" : "secondary"} className="ml-2">
                    {t.enabled ? "on" : "off"}
                  </Badge>
                </span>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-destructive hover:underline"
                  onClick={() => removeTarget(t.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <AddTargetForm flagKey={flag.key} countries={countries} onChanged={onUpdate} />
      </CardContent>
    </Card>
  );
}

export function FeatureFlagsClient({
  initialFlags,
  countries,
}: {
  initialFlags: PlatformFeatureFlagSummary[];
  countries: PlatformCountrySummary[];
}) {
  const [flags, setFlags] = useState(initialFlags);

  function upsert(flag: PlatformFeatureFlagSummary) {
    setFlags((prev) => {
      const idx = prev.findIndex((f) => f.key === flag.key);
      if (idx === -1) return [...prev, flag].sort((a, b) => a.key.localeCompare(b.key));
      const next = [...prev];
      next[idx] = flag;
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <CreateFlagForm onCreated={upsert} />
      {flags.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No feature flags yet.
          </CardContent>
        </Card>
      ) : (
        flags.map((flag) => (
          <FlagCard key={flag.key} flag={flag} countries={countries} onUpdate={upsert} />
        ))
      )}
    </div>
  );
}
