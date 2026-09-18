"use client";

import type { StoreThemeSummary, ThemeCatalogEntry } from "@ocean/types";
import { Alert, Badge, Button, Card, CardContent, DataGrid, Dialog, FormField, Input, type DataGridColumn } from "@ocean/ui";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { api, errorMessage } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

export function ThemesManager({
  storeId,
  storeSlug,
  canEdit,
}: {
  storeId: string;
  storeSlug: string;
  canEdit: boolean;
}) {
  const [rows, setRows] = useState<StoreThemeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ data: StoreThemeSummary[] }>(`/stores/${storeId}/themes`);
      setRows(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: DataGridColumn<StoreThemeSummary>[] = [
    {
      key: "name",
      header: "Theme",
      cell: (t) => (
        <Link href={`/${storeSlug}/storefront/themes/${t.id}`} className="font-medium hover:underline">
          {t.name}
        </Link>
      ),
    },
    {
      key: "role",
      header: "Role",
      cell: (t) => <Badge variant={t.role === "main" ? "success" : "secondary"}>{t.role}</Badge>,
    },
    {
      key: "publishedAt",
      header: "Published",
      cell: (t) => (t.publishedAt ? new Date(t.publishedAt).toLocaleString() : "Never"),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Install a theme, then customize and publish it. Only one theme is live at a time.
        </p>
        {canEdit && <Button onClick={() => setInstalling(true)}>Install theme</Button>}
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(t) => t.id}
        loading={loading}
        empty={{
          title: "No themes installed",
          description: "Install the Foundation theme to get a working storefront.",
          action: canEdit ? <Button onClick={() => setInstalling(true)}>Install a theme</Button> : undefined,
        }}
      />
      <InstallThemeDialog
        storeId={storeId}
        open={installing}
        onClose={() => setInstalling(false)}
        onInstalled={() => void load()}
      />
    </div>
  );
}

function InstallThemeDialog({
  storeId,
  open,
  onClose,
  onInstalled,
}: {
  storeId: string;
  open: boolean;
  onClose: () => void;
  onInstalled: () => void;
}) {
  const submit = useSubmit();
  const { reset } = submit;
  const [catalog, setCatalog] = useState<ThemeCatalogEntry[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    if (!open) return;
    reset();
    setSelectedId(null);
    setName("");
    setLoadingCatalog(true);
    api<{ data: ThemeCatalogEntry[] }>(`/stores/${storeId}/themes/catalog`)
      .then((res) => setCatalog(res.data))
      .catch(() => setCatalog([]))
      .finally(() => setLoadingCatalog(false));
  }, [open, storeId, reset]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    const res = await submit.run(() =>
      api(`/stores/${storeId}/themes`, { body: { themeId: selectedId, name: name || undefined } }),
    );
    if (res !== undefined) {
      onInstalled();
      onClose();
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Install theme"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button type="submit" form="install-theme-form" loading={submit.pending} disabled={!selectedId}>
            Install
          </Button>
        </>
      }
    >
      <form id="install-theme-form" onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        {loadingCatalog ? (
          <p className="text-sm text-muted-foreground">Loading catalog…</p>
        ) : catalog.length === 0 ? (
          <p className="text-sm text-muted-foreground">No themes available in the catalog.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {catalog.map((t) => (
              <Card
                key={t.id}
                className={selectedId === t.id ? "border-primary" : undefined}
                onClick={() => setSelectedId(t.id)}
              >
                <CardContent className="cursor-pointer py-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{t.name}</span>
                    {t.latestRelease && (
                      <span className="text-xs text-muted-foreground">v{t.latestRelease.version}</span>
                    )}
                  </div>
                  {t.description && <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        <FormField id="install-theme-name" label="Name (optional)">
          <Input id="install-theme-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My theme" />
        </FormField>
      </form>
    </Dialog>
  );
}
