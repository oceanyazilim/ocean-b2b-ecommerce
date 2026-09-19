"use client";

import type { PlatformMeResponse } from "@ocean/types";
import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, FormField, Input } from "@ocean/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

export function LoginForm({ next }: { next?: string | undefined }) {
  const router = useRouter();
  const { pending, error, fieldErrors, run } = useSubmit();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await run(() =>
      api<{ data: PlatformMeResponse }>("/auth/login", { body: { email, password } }),
    );
    if (!res) return;
    router.replace(next ?? "/organizations");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Platform operator access only — this is not the merchant admin.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          {error && <Alert variant="error">{error}</Alert>}
          <FormField id="email" label="Email" error={fieldErrors["email"]}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              invalid={!!fieldErrors["email"]}
            />
          </FormField>
          <FormField id="password" label="Password" error={fieldErrors["password"]}>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              invalid={!!fieldErrors["password"]}
            />
          </FormField>
          <Button type="submit" loading={pending} className="w-full">
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
