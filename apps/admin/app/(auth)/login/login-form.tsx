"use client";

import type { LoginResponse } from "@ocean/types";
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
import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

export function LoginForm({ next }: { next?: string | undefined }) {
  const router = useRouter();
  const { pending, error, fieldErrors, run, reset } = useSubmit();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState("");

  function finish() {
    router.replace(next ?? "/");
    router.refresh();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await run(() =>
      api<{ data: LoginResponse }>("/auth/login", { body: { email, password } }),
    );
    if (!res) return;
    if (res.data.mfaRequired) setChallengeToken(res.data.challengeToken);
    else finish();
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    const ok = await run(() => api("/auth/mfa/verify", { body: { challengeToken, code } }));
    if (ok !== undefined) finish();
  }

  if (challengeToken) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Two-factor authentication</CardTitle>
          <CardDescription>
            Enter the 6-digit code from your authenticator app, or one of your recovery codes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onVerify} className="flex flex-col gap-4" noValidate>
            {error && <Alert variant="error">{error}</Alert>}
            <FormField id="code" label="Code" error={fieldErrors["code"]}>
              <Input
                id="code"
                autoComplete="one-time-code"
                inputMode="text"
                autoFocus
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                invalid={!!fieldErrors["code"]}
              />
            </FormField>
            <Button type="submit" loading={pending} className="w-full">
              Verify
            </Button>
            <button
              type="button"
              className="text-center text-sm text-muted-foreground hover:underline"
              onClick={() => {
                setChallengeToken(null);
                setCode("");
                reset();
              }}
            >
              Back to sign in
            </button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Use your work email to access your stores.</CardDescription>
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
          <div className="flex items-center justify-between text-sm">
            <Link href="/forgot-password" className="text-muted-foreground hover:underline">
              Forgot password?
            </Link>
            <Link href="/signup" className="font-medium hover:underline">
              Create account
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
