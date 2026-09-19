"use client";

import type { ApiKeySummary, DeveloperAppSummary, WebhookSummary } from "@ocean/types";
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, ConfirmDialog, Dialog, FormField, Input, Skeleton, TagInput } from "@ocean/ui";
import { useCallback, useEffect, useState } from "react";

import { api, errorMessage } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

const SCOPE_HINT = "e.g. products.read, orders.read, customers.read, themes.edit";

function CopySecret({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied by the browser; the value is still selectable below.
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        {label} This is shown once — copy it now, it can&apos;t be displayed again.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded-md border bg-muted px-3 py-2 text-xs">{value}</code>
        <Button size="sm" variant="outline" onClick={() => void copy()}>
          {copied ? "Copied ✓" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

export function DeveloperManager({ storeId }: { storeId: string }) {
  const [apps, setApps] = useState<DeveloperAppSummary[] | null>(null);
  const [keys, setKeys] = useState<ApiKeySummary[] | null>(null);
  const [webhooks, setWebhooks] = useState<WebhookSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [creatingApp, setCreatingApp] = useState(false);
  const [creatingKey, setCreatingKey] = useState(false);
  const [creatingWebhook, setCreatingWebhook] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<{ label: string; value: string } | null>(null);
  const [revoking, setRevoking] = useState<{ kind: "app" | "key" | "webhook"; id: string; name: string } | null>(null);

  const [appName, setAppName] = useState("");
  const [appScopes, setAppScopes] = useState<string[]>([]);
  const [keyName, setKeyName] = useState("");
  const [keyScopes, setKeyScopes] = useState<string[]>([]);
  const [webhookTopic, setWebhookTopic] = useState("order.created");
  const [webhookUrl, setWebhookUrl] = useState("");

  const createAppAction = useSubmit();
  const createKeyAction = useSubmit();
  const createWebhookAction = useSubmit();
  const revokeAction = useSubmit();

  const base = `/stores/${storeId}/developer`;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [a, k, w] = await Promise.all([
        api<{ data: DeveloperAppSummary[] }>(`${base}/apps`),
        api<{ data: ApiKeySummary[] }>(`${base}/api-keys`),
        api<{ data: WebhookSummary[] }>(`${base}/webhooks`),
      ]);
      setApps(a.data);
      setKeys(k.data);
      setWebhooks(w.data);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createApp() {
    const created = await createAppAction.run(() =>
      api<{ data: DeveloperAppSummary & { clientSecret: string } }>(`${base}/apps`, {
        method: "POST",
        body: { name: appName, scopes: appScopes },
      }),
    );
    if (created !== undefined) {
      setCreatingApp(false);
      setAppName("");
      setAppScopes([]);
      setRevealedSecret({
        label: `Client ID: ${created.data.clientId} — save the client secret too.`,
        value: created.data.clientSecret,
      });
      await load();
    }
  }

  async function createKey() {
    const created = await createKeyAction.run(() =>
      api<{ data: ApiKeySummary & { secret: string } }>(`${base}/api-keys`, {
        method: "POST",
        body: { name: keyName, scopes: keyScopes },
      }),
    );
    if (created !== undefined) {
      setCreatingKey(false);
      setKeyName("");
      setKeyScopes([]);
      setRevealedSecret({ label: "API key secret.", value: created.data.secret });
      await load();
    }
  }

  async function createWebhook() {
    const created = await createWebhookAction.run(() =>
      api<{ data: WebhookSummary & { secret: string } }>(`${base}/webhooks`, {
        method: "POST",
        body: { topic: webhookTopic, url: webhookUrl },
      }),
    );
    if (created !== undefined) {
      setCreatingWebhook(false);
      setWebhookUrl("");
      setRevealedSecret({
        label: "Webhook signing secret — verify X-Ocean-Signature with it.",
        value: created.data.secret,
      });
      await load();
    }
  }

  async function confirmRevoke() {
    if (!revoking) return;
    const path =
      revoking.kind === "app"
        ? `${base}/apps/${revoking.id}/revoke`
        : revoking.kind === "key"
          ? `${base}/api-keys/${revoking.id}/revoke`
          : `${base}/webhooks/${revoking.id}`;
    const ok = await revokeAction.run(() =>
      api(path, { method: revoking.kind === "webhook" ? "DELETE" : "POST" }),
    );
    if (ok !== undefined) {
      setRevoking(null);
      await load();
    }
  }

  if (!apps || !keys || !webhooks) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Developer</h1>
        <p className="text-sm text-muted-foreground">
          Custom apps, API keys, and webhooks for your own integrations against the Developer
          API (<code>/api/2026-01</code>).
        </p>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-base">Apps</CardTitle>
            <CardDescription>OAuth client_credentials apps — each owns its own keys.</CardDescription>
          </div>
          <Button size="sm" onClick={() => setCreatingApp(true)}>
            Create app
          </Button>
        </CardHeader>
        <CardContent>
          {apps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No apps yet.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {apps.map((app) => (
                <li key={app.id} className="flex items-center justify-between border-b py-2 last:border-0">
                  <div>
                    <p className="font-medium">{app.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {app.clientId} · {app.scopes.join(", ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={app.status === "active" ? "success" : "secondary"}>{app.status}</Badge>
                    {app.status === "active" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRevoking({ kind: "app", id: app.id, name: app.name })}
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-base">API keys</CardTitle>
            <CardDescription>Static Bearer tokens for scripts and CLIs.</CardDescription>
          </div>
          <Button size="sm" onClick={() => setCreatingKey(true)}>
            Create key
          </Button>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No API keys yet.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {keys.map((key) => (
                <li key={key.id} className="flex items-center justify-between border-b py-2 last:border-0">
                  <div>
                    <p className="font-medium">{key.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {key.scopes.join(", ")}
                      {key.lastUsedAt ? ` · last used ${new Date(key.lastUsedAt).toLocaleDateString()}` : " · never used"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={key.revokedAt ? "secondary" : "success"}>
                      {key.revokedAt ? "revoked" : "active"}
                    </Badge>
                    {!key.revokedAt && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRevoking({ kind: "key", id: key.id, name: key.name })}
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-base">Webhooks</CardTitle>
            <CardDescription>HMAC-signed HTTP callbacks for store events.</CardDescription>
          </div>
          <Button size="sm" onClick={() => setCreatingWebhook(true)}>
            Add webhook
          </Button>
        </CardHeader>
        <CardContent>
          {webhooks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No webhooks yet.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {webhooks.map((hook) => (
                <li key={hook.id} className="flex items-center justify-between border-b py-2 last:border-0">
                  <div>
                    <p className="font-medium">{hook.topic}</p>
                    <p className="max-w-md truncate text-xs text-muted-foreground">{hook.url}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={hook.status === "active" ? "success" : "secondary"}>{hook.status}</Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setRevoking({ kind: "webhook", id: hook.id, name: hook.topic })}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={creatingApp} onClose={() => setCreatingApp(false)} title="Create app">
        <div className="flex flex-col gap-3">
          {createAppAction.error && <Alert variant="error">{createAppAction.error}</Alert>}
          <FormField id="app-name" label="Name">
            <Input id="app-name" value={appName} onChange={(e) => setAppName(e.target.value)} />
          </FormField>
          <FormField id="app-scopes" label="Scopes" hint={SCOPE_HINT}>
            <TagInput id="app-scopes" value={appScopes} onChange={setAppScopes} />
          </FormField>
          <Button onClick={() => void createApp()} loading={createAppAction.pending} disabled={!appName || appScopes.length === 0}>
            Create
          </Button>
        </div>
      </Dialog>

      <Dialog open={creatingKey} onClose={() => setCreatingKey(false)} title="Create API key">
        <div className="flex flex-col gap-3">
          {createKeyAction.error && <Alert variant="error">{createKeyAction.error}</Alert>}
          <FormField id="key-name" label="Name">
            <Input id="key-name" value={keyName} onChange={(e) => setKeyName(e.target.value)} />
          </FormField>
          <FormField id="key-scopes" label="Scopes" hint={SCOPE_HINT}>
            <TagInput id="key-scopes" value={keyScopes} onChange={setKeyScopes} />
          </FormField>
          <Button onClick={() => void createKey()} loading={createKeyAction.pending} disabled={!keyName || keyScopes.length === 0}>
            Create
          </Button>
        </div>
      </Dialog>

      <Dialog open={creatingWebhook} onClose={() => setCreatingWebhook(false)} title="Add webhook">
        <div className="flex flex-col gap-3">
          {createWebhookAction.error && <Alert variant="error">{createWebhookAction.error}</Alert>}
          <FormField id="webhook-topic" label="Topic" hint="e.g. order.created, quote.accepted, return.requested">
            <Input id="webhook-topic" value={webhookTopic} onChange={(e) => setWebhookTopic(e.target.value)} />
          </FormField>
          <FormField id="webhook-url" label="URL">
            <Input id="webhook-url" type="url" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://" />
          </FormField>
          <Button onClick={() => void createWebhook()} loading={createWebhookAction.pending} disabled={!webhookTopic || !webhookUrl}>
            Add
          </Button>
        </div>
      </Dialog>

      <Dialog open={revealedSecret !== null} onClose={() => setRevealedSecret(null)} title="Save this secret">
        {revealedSecret && <CopySecret label={revealedSecret.label} value={revealedSecret.value} />}
      </Dialog>

      <ConfirmDialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        title={revoking?.kind === "webhook" ? `Delete webhook "${revoking.name}"?` : `Revoke "${revoking?.name}"?`}
        description={
          revoking?.kind === "app"
            ? "This also revokes every API key this app issued."
            : "Anything using this credential will stop working immediately."
        }
        destructive
        pending={revokeAction.pending}
        onConfirm={confirmRevoke}
      />
    </div>
  );
}
