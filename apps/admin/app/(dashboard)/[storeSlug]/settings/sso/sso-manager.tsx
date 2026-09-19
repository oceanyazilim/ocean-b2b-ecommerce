"use client";

import type { SsoConnectionSummary } from "@ocean/types";
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, ConfirmDialog, FormField, Input, Select, Skeleton } from "@ocean/ui";
import { useCallback, useEffect, useState } from "react";

import { api, errorMessage } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

const ORG_ROLES = ["member", "billing", "admin", "owner"] as const;

export function SsoManager({ organizationId }: { organizationId: string }) {
  const [connection, setConnection] = useState<SsoConnectionSummary | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [copied, setCopied] = useState(false);
  const saveAction = useSubmit();
  const removeAction = useSubmit();

  const [domain, setDomain] = useState("");
  const [issuer, setIssuer] = useState("");
  const [authorizationEndpoint, setAuthorizationEndpoint] = useState("");
  const [tokenEndpoint, setTokenEndpoint] = useState("");
  const [userinfoEndpoint, setUserinfoEndpoint] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [defaultRole, setDefaultRole] = useState<(typeof ORG_ROLES)[number]>("member");

  const base = `/organizations/${organizationId}/sso`;

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ data: SsoConnectionSummary | null }>(base);
      setConnection(res.data);
      if (res.data) {
        setDomain(res.data.domain);
        setIssuer(res.data.issuer);
        setClientId(res.data.clientId);
        setDefaultRole(res.data.defaultRole as (typeof ORG_ROLES)[number]);
      }
    } catch (err) {
      setError(errorMessage(err));
      // Without this, a failed initial load leaves `connection` at its initial `undefined`
      // forever, and the loading skeleton (gated on `connection === undefined`) never gives
      // way to the error Alert below it.
      setConnection((prev) => (prev === undefined ? null : prev));
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    const ok = await saveAction.run(() =>
      api(base, {
        method: "PUT",
        body: {
          domain,
          issuer,
          authorizationEndpoint,
          tokenEndpoint,
          userinfoEndpoint,
          clientId,
          clientSecret,
          defaultRole,
        },
      }),
    );
    if (ok !== undefined) {
      setClientSecret("");
      await load();
    }
  }

  async function remove() {
    const ok = await removeAction.run(() => api(base, { method: "DELETE" }));
    if (ok !== undefined) {
      setRemoving(false);
      setConnection(null);
    }
  }

  async function copyStartUrl() {
    if (!connection) return;
    try {
      await navigator.clipboard.writeText(connection.startUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied; the URL is still visible below.
    }
  }

  if (connection === undefined) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Single sign-on</h1>
        <p className="text-sm text-muted-foreground">
          Let your team sign in with your identity provider (OIDC authorization code flow).
        </p>
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {saveAction.error && <Alert variant="error">{saveAction.error}</Alert>}

      {connection && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardDescription>Status</CardDescription>
              <CardTitle className="flex items-center gap-2 text-lg">
                {connection.domain}
                <Badge variant={connection.status === "active" ? "success" : "secondary"}>
                  {connection.status}
                </Badge>
              </CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setRemoving(true)}>
              Remove
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              Give your team this sign-in link, or point your IdP&apos;s app tile at it:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-md border bg-muted px-3 py-2 text-xs">
                {connection.startUrl}
              </code>
              <Button size="sm" variant="outline" onClick={() => void copyStartUrl()}>
                {copied ? "Copied ✓" : "Copy"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{connection ? "Update connection" : "Connect an identity provider"}</CardTitle>
          <CardDescription>
            The three endpoint URLs come from your IdP&apos;s OIDC app registration (no discovery
            document lookup — enter them directly).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField id="sso-domain" label="Email domain" hint="e.g. acme.com — only these accounts can use this connection">
            <Input id="sso-domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="acme.com" />
          </FormField>
          <FormField id="sso-role" label="Default role for new sign-ins">
            <Select id="sso-role" value={defaultRole} onChange={(e) => setDefaultRole(e.target.value as (typeof ORG_ROLES)[number])}>
              {ORG_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="sso-issuer" label="Issuer" className="sm:col-span-2">
            <Input id="sso-issuer" type="url" value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="https://idp.example.com" />
          </FormField>
          <FormField id="sso-authz" label="Authorization endpoint" className="sm:col-span-2">
            <Input id="sso-authz" type="url" value={authorizationEndpoint} onChange={(e) => setAuthorizationEndpoint(e.target.value)} />
          </FormField>
          <FormField id="sso-token" label="Token endpoint" className="sm:col-span-2">
            <Input id="sso-token" type="url" value={tokenEndpoint} onChange={(e) => setTokenEndpoint(e.target.value)} />
          </FormField>
          <FormField id="sso-userinfo" label="Userinfo endpoint" className="sm:col-span-2">
            <Input id="sso-userinfo" type="url" value={userinfoEndpoint} onChange={(e) => setUserinfoEndpoint(e.target.value)} />
          </FormField>
          <FormField id="sso-client-id" label="Client ID">
            <Input id="sso-client-id" value={clientId} onChange={(e) => setClientId(e.target.value)} />
          </FormField>
          <FormField id="sso-client-secret" label="Client secret" hint="Re-enter it on every save — it's never sent back for display, so this form can't tell you it's already set.">
            <Input id="sso-client-secret" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
          </FormField>
          <div className="sm:col-span-2">
            <Button onClick={() => void save()} loading={saveAction.pending} disabled={!clientSecret}>
              {connection ? "Save changes" : "Connect"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={removing}
        onClose={() => setRemoving(false)}
        title="Remove SSO connection?"
        description="Members will need to sign in with their password instead."
        destructive
        pending={removeAction.pending}
        onConfirm={remove}
      />
    </div>
  );
}
