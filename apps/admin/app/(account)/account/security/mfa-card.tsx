"use client";

import type { MfaSetupResponse, MfaStatus } from "@ocean/types";
import {
  Alert,
  Badge,
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

type Mode = "idle" | "setup" | "disable" | "regenerate";

export function MfaCard({ status }: { status: MfaStatus }) {
  const router = useRouter();
  const { pending, error, fieldErrors, run, reset } = useSubmit();
  const [mode, setMode] = useState<Mode>("idle");
  const [setup, setSetup] = useState<MfaSetupResponse | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);

  function leave() {
    setMode("idle");
    setSetup(null);
    setCode("");
    setPassword("");
    reset();
  }

  async function startSetup() {
    const res = await run(() =>
      api<{ data: MfaSetupResponse }>("/auth/mfa/setup", { method: "POST" }),
    );
    if (res) {
      setSetup(res.data);
      setMode("setup");
    }
  }

  async function enable(e: React.FormEvent) {
    e.preventDefault();
    const res = await run(() =>
      api<{ data: { recoveryCodes: string[] } }>("/auth/mfa/enable", { body: { code } }),
    );
    if (res) {
      setRecoveryCodes(res.data.recoveryCodes);
      leave();
      router.refresh();
    }
  }

  async function disable(e: React.FormEvent) {
    e.preventDefault();
    const ok = await run(() => api("/auth/mfa/disable", { body: { password, code } }));
    if (ok !== undefined) {
      leave();
      router.refresh();
    }
  }

  async function regenerate(e: React.FormEvent) {
    e.preventDefault();
    const res = await run(() =>
      api<{ data: { recoveryCodes: string[] } }>("/auth/mfa/recovery-codes", {
        body: { password },
      }),
    );
    if (res) {
      setRecoveryCodes(res.data.recoveryCodes);
      leave();
      router.refresh();
    }
  }

  async function copyCodes() {
    if (!recoveryCodes) return;
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>Two-factor authentication</CardTitle>
            <CardDescription>
              Adds a one-time code from an authenticator app to every sign-in.
            </CardDescription>
          </div>
          <Badge variant={status.enabled ? "success" : "secondary"}>
            {status.enabled ? "Enabled" : "Off"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && !Object.keys(fieldErrors).length && <Alert variant="error">{error}</Alert>}

        {recoveryCodes && (
          <Alert variant="warning" title="Save your recovery codes now">
            <p className="mb-2">
              Each code signs you in once if you lose your authenticator. They will not be shown
              again.
            </p>
            <pre className="mb-2 grid grid-cols-2 gap-x-6 rounded bg-background p-3 font-mono text-sm">
              {recoveryCodes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </pre>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={copyCodes}>
                {copied ? "Copied" : "Copy codes"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRecoveryCodes(null)}>
                I saved them
              </Button>
            </div>
          </Alert>
        )}

        {mode === "idle" && !status.enabled && (
          <div>
            <Button onClick={startSetup} loading={pending}>
              Set up two-factor authentication
            </Button>
          </div>
        )}

        {mode === "idle" && status.enabled && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Enabled {status.enabledAt ? new Date(status.enabledAt).toLocaleDateString() : ""} ·{" "}
              {status.recoveryCodesRemaining} recovery codes left
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setMode("regenerate")}>
                Regenerate recovery codes
              </Button>
              <Button variant="destructive" onClick={() => setMode("disable")}>
                Disable
              </Button>
            </div>
          </div>
        )}

        {mode === "setup" && setup && (
          <form onSubmit={enable} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-4 sm:flex-row">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={setup.qrDataUrl}
                alt="Scan this QR code with your authenticator app"
                width={200}
                height={200}
                className="rounded border bg-white"
              />
              <div className="flex flex-col gap-2 text-sm">
                <p>1. Scan the QR code with Google Authenticator, 1Password, Authy or similar.</p>
                <p className="text-muted-foreground">
                  Can&apos;t scan? Enter this key manually:{" "}
                  <code className="rounded bg-muted px-1 font-mono">{setup.secret}</code>
                </p>
                <p>2. Enter the 6-digit code the app shows to confirm.</p>
              </div>
            </div>
            <FormField
              id="mfa-code"
              label="Code from the app"
              error={fieldErrors["code"]}
              className="max-w-xs"
            >
              <Input
                id="mfa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                invalid={!!fieldErrors["code"]}
              />
            </FormField>
            <div className="flex gap-2">
              <Button type="submit" loading={pending}>
                Turn on
              </Button>
              <Button type="button" variant="ghost" onClick={leave}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {mode === "disable" && (
          <form onSubmit={disable} className="flex max-w-sm flex-col gap-4" noValidate>
            <Alert variant="warning">Confirm with your password and a current code.</Alert>
            <FormField id="disable-password" label="Password" error={fieldErrors["password"]}>
              <Input
                id="disable-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </FormField>
            <FormField
              id="disable-code"
              label="Authenticator or recovery code"
              error={fieldErrors["code"]}
            >
              <Input id="disable-code" value={code} onChange={(e) => setCode(e.target.value)} />
            </FormField>
            <div className="flex gap-2">
              <Button type="submit" variant="destructive" loading={pending}>
                Disable two-factor
              </Button>
              <Button type="button" variant="ghost" onClick={leave}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {mode === "regenerate" && (
          <form onSubmit={regenerate} className="flex max-w-sm flex-col gap-4" noValidate>
            <Alert variant="info">Old recovery codes stop working immediately.</Alert>
            <FormField id="regen-password" label="Password" error={fieldErrors["password"]}>
              <Input
                id="regen-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </FormField>
            <div className="flex gap-2">
              <Button type="submit" loading={pending}>
                Generate new codes
              </Button>
              <Button type="button" variant="ghost" onClick={leave}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
