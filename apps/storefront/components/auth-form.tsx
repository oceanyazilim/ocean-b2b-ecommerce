"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { api, errorMessage } from "@/lib/client-api";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api(`/auth/${mode}`, {
        body: mode === "signup" ? { email, password, firstName: firstName || undefined } : { email, password },
      });
      router.push("/account");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="mx-auto flex max-w-sm flex-col gap-3 px-6 py-16">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">{mode === "login" ? "Sign in" : "Create an account"}</h1>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {mode === "signup" && (
        <input
          placeholder="First name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        />
      )}
      <input
        type="email"
        required
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
      />
      <input
        type="password"
        required
        minLength={8}
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="mt-1 inline-flex h-10 items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
      </button>
    </form>
  );
}
