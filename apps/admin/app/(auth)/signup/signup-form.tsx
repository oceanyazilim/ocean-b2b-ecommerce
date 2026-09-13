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
import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

export function SignupForm({
  next,
  initialEmail,
}: {
  next?: string | undefined;
  initialEmail?: string | undefined;
}) {
  const router = useRouter();
  const { pending, error, fieldErrors, run } = useSubmit();
  const [name, setName] = useState("");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [password, setPassword] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await run(() => api("/auth/signup", { body: { name, email, password } }));
    if (ok !== undefined) {
      router.replace(next ?? "/onboarding/organization");
      router.refresh();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>
          Start with an account, then set up your organization and store.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          {error && <Alert variant="error">{error}</Alert>}
          <FormField id="name" label="Full name" error={fieldErrors["name"]}>
            <Input
              id="name"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              invalid={!!fieldErrors["name"]}
            />
          </FormField>
          <FormField id="email" label="Work email" error={fieldErrors["email"]}>
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
          <FormField
            id="password"
            label="Password"
            hint="At least 10 characters."
            error={fieldErrors["password"]}
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
            {pending ? "Creating account…" : "Create account"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-foreground hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
