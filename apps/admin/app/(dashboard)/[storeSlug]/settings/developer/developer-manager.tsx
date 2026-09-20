"use client";

import type { ApiKeySummary, DeveloperAppSummary, WebhookSummary } from "@ocean/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  DataGrid,
  Dialog,
  FormField,
  Input,
  Skeleton,
  TagInput,
  type DataGridColumn,
} from "@ocean/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import { api, errorMessage } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

const SCOPE_HINT = "e.g. products.read, orders.read, customers.read, themes.edit";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 py-4">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xl font-semibold tabular-nums">{value}</span>
      </CardContent>
    </Card>
  );
}

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
      // Without this, a failed initial load leaves apps/keys/webhooks at their initial `null`
      // forever, and the loading skeleton (gated on `!apps || !keys || !webhooks`) never gives
      // way to the error Alert below it.
      setApps((prev) => prev ?? []);
      setKeys((prev) => prev ?? []);
      setWebhooks((prev) => prev ?? []);
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

  const stats = useMemo(() => {
    const activeApps = (apps ?? []).filter((a) => a.status === "active").length;
    const activeKeys = (keys ?? []).filter((k) => !k.revokedAt).length;
    const activeWebhooks = (webhooks ?? []).filter((w) => w.status === "active").length;
    return {
      apps: apps?.length ?? 0,
      keys: keys?.length ?? 0,
      webhooks: webhooks?.length ?? 0,
      active: activeApps + activeKeys + activeWebhooks,
    };
  }, [apps, keys, webhooks]);

  const appColumns: DataGridColumn<DeveloperAppSummary>[] = [
    {
      key: "name",
      header: "App",
      cell: (app) => (
        <div className="flex flex-col">
          <span className="font-medium">{app.name}</span>
          <code className="text-xs text-muted-foreground">{app.clientId}</code>
        </div>
      ),
    },
    {
      key: "scopes",
      header: "Scopes",
      cell: (app) => <span className="text-muted-foreground">{app.scopes.join(", ") || "—"}</span>,
    },
    {
      key: "createdAt",
      header: "Created",
      cell: (app) => <span className="text-muted-foreground">{formatDate(app.createdAt)}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (app) => <Badge variant={app.status === "active" ? "success" : "secondary"}>{app.status}</Badge>,
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (app) =>
        app.status === "active" ? (
          <Button size="sm" variant="ghost" onClick={() => setRevoking({ kind: "app", id: app.id, name: app.name })}>
            Revoke
          </Button>
        ) : null,
    },
  ];

  const keyColumns: DataGridColumn<ApiKeySummary>[] = [
    { key: "name", header: "Key", cell: (key) => <span className="font-medium">{key.name}</span> },
    {
      key: "scopes",
      header: "Scopes",
      cell: (key) => <span className="text-muted-foreground">{key.scopes.join(", ") || "—"}</span>,
    },
    {
      key: "lastUsedAt",
      header: "Last used",
      cell: (key) => (
        <span className="text-muted-foreground">{key.lastUsedAt ? formatDate(key.lastUsedAt) : "Never used"}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (key) => <Badge variant={key.revokedAt ? "secondary" : "success"}>{key.revokedAt ? "revoked" : "active"}</Badge>,
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (key) =>
        !key.revokedAt ? (
          <Button size="sm" variant="ghost" onClick={() => setRevoking({ kind: "key", id: key.id, name: key.name })}>
            Revoke
          </Button>
        ) : null,
    },
  ];

  const webhookColumns: DataGridColumn<WebhookSummary>[] = [
    { key: "topic", header: "Topic", cell: (hook) => <span className="font-medium">{hook.topic}</span> },
    {
      key: "url",
      header: "URL",
      cell: (hook) => <span className="block max-w-md truncate text-muted-foreground">{hook.url}</span>,
    },
    {
      key: "createdAt",
      header: "Created",
      cell: (hook) => <span className="text-muted-foreground">{formatDate(hook.createdAt)}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (hook) => <Badge variant={hook.status === "active" ? "success" : "secondary"}>{hook.status}</Badge>,
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (hook) => (
        <Button size="sm" variant="ghost" onClick={() => setRevoking({ kind: "webhook", id: hook.id, name: hook.topic })}>
          Delete
        </Button>
      ),
    },
  ];

  if (!apps || !keys || !webhooks) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Apps</h1>
        <p className="text-sm text-muted-foreground">
          Your store&apos;s own custom apps, API keys, and webhooks against the Developer API
          (<code>/api/2026-01</code>).
        </p>
      </div>

      <Alert variant="info">
        This is your store&apos;s developer platform for building your own integrations — not a marketplace of
        pre-built third-party apps to browse and install. Each app authenticates with OAuth client_credentials and
        requests the scopes (permissions) it needs.
      </Alert>

      {error && <Alert variant="error">{error}</Alert>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Apps" value={String(stats.apps)} />
        <StatCard label="API keys" value={String(stats.keys)} />
        <StatCard label="Webhooks" value={String(stats.webhooks)} />
        <StatCard label="Active credentials" value={String(stats.active)} />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Your apps</h2>
            <p className="text-sm text-muted-foreground">OAuth client_credentials apps — each owns its own keys.</p>
          </div>
          <Button size="sm" onClick={() => setCreatingApp(true)}>
            Create app
          </Button>
        </div>
        <DataGrid
          columns={appColumns}
          rows={apps}
          rowKey={(app) => app.id}
          empty={{
            title: "No apps yet",
            description: "Create your first custom app to get a client ID and secret.",
            action: <Button onClick={() => setCreatingApp(true)}>Create app</Button>,
          }}
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">API keys</h2>
            <p className="text-sm text-muted-foreground">Static Bearer tokens for scripts and CLIs.</p>
          </div>
          <Button size="sm" onClick={() => setCreatingKey(true)}>
            Create key
          </Button>
        </div>
        <DataGrid
          columns={keyColumns}
          rows={keys}
          rowKey={(key) => key.id}
          empty={{
            title: "No API keys yet",
            description: "Create a static key for a script or CLI to call the Developer API.",
            action: <Button onClick={() => setCreatingKey(true)}>Create key</Button>,
          }}
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Webhooks</h2>
            <p className="text-sm text-muted-foreground">HMAC-signed HTTP callbacks for store events.</p>
          </div>
          <Button size="sm" onClick={() => setCreatingWebhook(true)}>
            Add webhook
          </Button>
        </div>
        <DataGrid
          columns={webhookColumns}
          rows={webhooks}
          rowKey={(hook) => hook.id}
          empty={{
            title: "No webhooks yet",
            description: "Add a webhook to receive HMAC-signed callbacks for store events.",
            action: <Button onClick={() => setCreatingWebhook(true)}>Add webhook</Button>,
          }}
        />
      </div>

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
