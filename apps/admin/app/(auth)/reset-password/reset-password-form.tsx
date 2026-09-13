"use client";

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
import Link from "next/link";
import { useState } from "react";

import { api } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

export function ResetPasswordForm({ token }: { token: string | null }) {
  const { pending, error, fieldErrors, run } = useSubmit();
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await run(() => api("/auth/reset-password", { body: { token, password } }));
    if (ok !== undefined) setDone(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>All existing sessions will be signed out.</CardDescription>
      </CardHeader>
      <CardContent>
        {!token ? (
          <Alert variant="error">
            This link is missing its token. Request a new one from the{" "}
            <Link href="/forgot-password" className="underline">
              reset page
            </Link>
            .
          </Alert>
        ) : done ? (
          <div className="flex flex-col gap-4">
            <Alert variant="success">Your password has been updated.</Alert>
            <Link href="/login" className="text-sm font-medium hover:underline">
              Sign in with your new password
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            {error && <Alert variant="error">{error}</Alert>}
            <FormField
              id="password"
              label="New password"
              hint="At least 10 characters."
              error={fieldErrors["password"] ?? fieldErrors["token"]}
            >
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={10}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                invalid={!!fieldErrors["password"]}
              />
            </FormField>
            <Button type="submit" loading={pending} className="w-full">
              Update password
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
