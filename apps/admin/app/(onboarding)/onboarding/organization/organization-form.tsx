"use client";

import type { OrganizationSummary } from "@ocean/types";
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

export function OrganizationForm({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const { pending, error, fieldErrors, run } = useSubmit();
  const [name, setName] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await run(() =>
      api<{ data: OrganizationSummary }>("/organizations", { body: { name } }),
    );
    if (res) {
      router.replace(`/onboarding/store?organization=${res.data.id}`);
      router.refresh();
    }
  }

  return (
    <Card>
      <CardHeader>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Step 1 of 2
        </p>
        <CardTitle>Create your organization</CardTitle>
        <CardDescription>
          The organization owns billing and can run several stores — for example a holding with
          separate wholesale and retail storefronts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          {error && <Alert variant="error">{error}</Alert>}
          <FormField id="name" label="Organization name" error={fieldErrors["name"]}>
            <Input
              id="name"
              required
              placeholder="ACME Holding"
              value={name}
              onChange={(e) => setName(e.target.value)}
              invalid={!!fieldErrors["name"]}
              disabled={disabled}
            />
          </FormField>
          <Button type="submit" loading={pending} disabled={disabled}>
            Continue
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
