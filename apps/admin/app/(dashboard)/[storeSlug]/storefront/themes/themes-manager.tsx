"use client";

import type { StoreThemeDetail, StoreThemeSummary, ThemeCatalogEntry } from "@ocean/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ExternalLinkIcon,
  FormField,
  Input,
  PaletteIcon,
  PencilIcon,
  PlusIcon,
  Skeleton,
  TrashIcon,
  UploadCloudIcon,
} from "@ocean/ui";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { api, errorMessage } from "@/lib/api";
import { buildPreviewUrl } from "@/lib/theme-preview";
import { useSubmit } from "@/lib/use-submit";

// Finds a theme's draft (falling back to its most recent version) — everything that needs to
// resolve "the version to act on" (preview, publish) goes through this, since the list endpoint
// only returns summaries.
async function resolveActingVersionId(storeId: string, storeThemeId: string): Promise<string | null> {
  const detail = (await api<{ data: StoreThemeDetail }>(`/stores/${storeId}/themes/${storeThemeId}`)).data;
  const draft = detail.versions.find((v) => v.status === "draft");
  const version = draft ?? [...detail.versions].sort((a, b) => b.number - a.number)[0];
  return version?.id ?? null;
}

export function ThemesManager({
  storeId,
  storeSlug,
  canEdit,
  canPublish,
}: {
  storeId: string;
  storeSlug: string;
  canEdit: boolean;
  canPublish: boolean;
}) {
  const [rows, setRows] = useState<StoreThemeSummary[]>([]);
  const [catalog, setCatalog] = useState<ThemeCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [renaming, setRenaming] = useState<StoreThemeSummary | null>(null);
  const [publishing, setPublishing] = useState<StoreThemeSummary | null>(null);
  const [deleting, setDeleting] = useState<StoreThemeSummary | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const publishAction = useSubmit();
  const deleteAction = useSubmit();

  const load = useCallback(async () => {
    setError(null);
    try {
      const [themesRes, catalogRes] = await Promise.all([
        api<{ data: StoreThemeSummary[] }>(`/stores/${storeId}/themes`),
        // The catalog is what carries each theme's category — the installed-theme summary
        // doesn't — so it's loaded up front to label cards, not only inside the install dialog.
        api<{ data: ThemeCatalogEntry[] }>(`/stores/${storeId}/themes/catalog`).catch(() => ({ data: [] })),
      ]);
      setRows(themesRes.data);
      setCatalog(catalogRes.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const categoryByThemeName = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of catalog) if (t.category) map.set(t.name, t.category);
    return map;
  }, [catalog]);

  async function previewTheme(t: StoreThemeSummary) {
    setPreviewError(null);
    setPreviewingId(t.id);
    try {
      const versionId = await resolveActingVersionId(storeId, t.id);
      if (!versionId) {
        setPreviewError(`${t.name} has no version to preview yet.`);
        return;
      }
      const url = await buildPreviewUrl(storeId, t.id, versionId);
      if (!url) {
        setPreviewError("Add a domain under Storefront → Domains to preview themes.");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setPreviewError(errorMessage(err));
    } finally {
      setPreviewingId(null);
    }
  }

  async function confirmPublish() {
    if (!publishing) return;
    const ok = await publishAction.run(async () => {
      const versionId = await resolveActingVersionId(storeId, publishing.id);
      if (!versionId) throw new Error(`${publishing.name} has no version to publish.`);
      return api(`/stores/${storeId}/themes/${publishing.id}/versions/${versionId}/publish`, { method: "POST" });
    });
    if (ok !== undefined) {
      setPublishing(null);
      await load();
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    const ok = await deleteAction.run(() => api(`/stores/${storeId}/themes/${deleting.id}`, { method: "DELETE" }));
    if (ok !== undefined) {
      setDeleting(null);
      await load();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Install a theme, then customize it visually and publish when it&apos;s ready. Only one theme is live at a
          time.
        </p>
        {canEdit && (
          <Button onClick={() => setInstalling(true)}>
            <PlusIcon size={16} />
            Install theme
          </Button>
        )}
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      {previewError && (
        <Alert variant="warning" onClick={() => setPreviewError(null)}>
          {previewError}
        </Alert>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No themes installed"
          description="Install the Foundation theme to get a working storefront, then customize it with the no-code editor."
          action={canEdit ? <Button onClick={() => setInstalling(true)}>Install a theme</Button> : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((t) => (
            <ThemeCard
              key={t.id}
              theme={t}
              storeSlug={storeSlug}
              category={categoryByThemeName.get(t.name)}
              canEdit={canEdit}
              canPublish={canPublish}
              previewing={previewingId === t.id}
              onPreview={() => void previewTheme(t)}
              onRename={() => setRenaming(t)}
              onPublish={() => setPublishing(t)}
              onDelete={() => setDeleting(t)}
            />
          ))}
        </div>
      )}

      <InstallThemeDialog
        storeId={storeId}
        catalog={catalog}
        open={installing}
        onClose={() => setInstalling(false)}
        onInstalled={() => void load()}
      />

      <RenameThemeDialog
        storeId={storeId}
        theme={renaming}
        onClose={() => setRenaming(null)}
        onRenamed={() => void load()}
      />

      <ConfirmDialog
        open={publishing !== null}
        onClose={() => setPublishing(null)}
        title={`Publish "${publishing?.name ?? ""}"?`}
        description="This makes it the live theme for your storefront, replacing the current one. The previously live theme stays installed, unpublished."
        confirmLabel="Publish"
        pending={publishAction.pending}
        onConfirm={confirmPublish}
      />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete "${deleting?.name ?? ""}"?`}
        description="This permanently removes the theme and its draft — customizations can't be recovered."
        confirmLabel="Delete"
        destructive
        pending={deleteAction.pending}
        onConfirm={confirmDelete}
      />
      {(publishAction.error || deleteAction.error) && (
        <Alert variant="error">{publishAction.error ?? deleteAction.error}</Alert>
      )}
    </div>
  );
}

function ThemeCard({
  theme,
  storeSlug,
  category,
  canEdit,
  canPublish,
  previewing,
  onPreview,
  onRename,
  onPublish,
  onDelete,
}: {
  theme: StoreThemeSummary;
  storeSlug: string;
  category: string | undefined;
  canEdit: boolean;
  canPublish: boolean;
  previewing: boolean;
  onPreview: () => void;
  onRename: () => void;
  onPublish: () => void;
  onDelete: () => void;
}) {
  const isLive = theme.role === "main";
  const editorHref = `/${storeSlug}/storefront/themes/${theme.id}/editor`;

  return (
    <Card className="flex flex-col overflow-hidden">
      <Link href={editorHref} className="group block border-b bg-muted/40" title="Customize this theme">
        {/* No real screenshot data exists for a theme version — this is an abstract layout
            placeholder (not a fabricated screenshot) that stands in for a preview thumbnail. */}
        <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden">
          <div className="flex w-3/5 flex-col gap-2">
            <div className="h-2 w-1/3 rounded-full bg-foreground/15" />
            <div className="h-12 w-full rounded-md bg-foreground/10" />
            <div className="h-1.5 w-full rounded-full bg-foreground/10" />
            <div className="h-1.5 w-4/5 rounded-full bg-foreground/10" />
            <div className="mt-1 flex gap-1.5">
              <div className="h-6 w-12 rounded bg-foreground/15" />
              <div className="h-6 w-12 rounded bg-foreground/10" />
            </div>
          </div>
          <div className="absolute inset-0 flex items-center justify-center bg-foreground/0 text-sm font-medium text-background opacity-0 transition-opacity group-hover:bg-foreground/70 group-hover:opacity-100">
            Open editor
          </div>
          {isLive && (
            <Badge variant="success" className="absolute left-2.5 top-2.5">
              Current theme
            </Badge>
          )}
        </div>
      </Link>
      <CardContent className="flex flex-1 flex-col gap-3 py-4">
        <div>
          <p className="truncate font-medium leading-tight">{theme.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {category ? `${category.charAt(0).toUpperCase()}${category.slice(1)} · ` : ""}
            {isLive ? "Live" : "Unpublished"}
          </p>
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-1.5">
          <Link href={editorHref}>
            <Button size="sm">Customize</Button>
          </Link>
          <Button size="sm" variant="outline" onClick={onPreview} loading={previewing}>
            <ExternalLinkIcon size={14} />
            Preview
          </Button>
          {isLive ? (
            canEdit && (
              <Button size="sm" variant="ghost" onClick={onRename}>
                <PencilIcon size={14} />
                Rename
              </Button>
            )
          ) : (
            <>
              {canPublish && (
                <Button size="sm" variant="outline" onClick={onPublish}>
                  <UploadCloudIcon size={14} />
                  Publish
                </Button>
              )}
              {canEdit && (
                <Button size="sm" variant="ghost" onClick={onDelete} aria-label={`Delete ${theme.name}`}>
                  <TrashIcon size={14} />
                </Button>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function RenameThemeDialog({
  storeId,
  theme,
  onClose,
  onRenamed,
}: {
  storeId: string;
  theme: StoreThemeSummary | null;
  onClose: () => void;
  onRenamed: () => void;
}) {
  const submit = useSubmit();
  const { reset } = submit;
  const [name, setName] = useState("");

  useEffect(() => {
    if (theme) {
      reset();
      setName(theme.name);
    }
  }, [theme, reset]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!theme || !name.trim()) return;
    const ok = await submit.run(() => api(`/stores/${storeId}/themes/${theme.id}`, { method: "PATCH", body: { name: name.trim() } }));
    if (ok !== undefined) {
      onRenamed();
      onClose();
    }
  }

  return (
    <Dialog
      open={theme !== null}
      onClose={onClose}
      title="Rename theme"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button type="submit" form="rename-theme-form" loading={submit.pending} disabled={!name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <form id="rename-theme-form" onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        <FormField id="rename-theme-name" label="Theme name">
          <Input id="rename-theme-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </FormField>
      </form>
    </Dialog>
  );
}

function InstallThemeDialog({
  storeId,
  catalog,
  open,
  onClose,
  onInstalled,
}: {
  storeId: string;
  catalog: ThemeCatalogEntry[];
  open: boolean;
  onClose: () => void;
  onInstalled: () => void;
}) {
  const submit = useSubmit();
  const { reset } = submit;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    if (!open) return;
    reset();
    setSelectedId(null);
    setName("");
  }, [open, reset]);

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
      description="Pick a theme from the catalog. You can customize and rename it after installing."
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
        {catalog.length === 0 ? (
          <p className="text-sm text-muted-foreground">No themes available in the catalog.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {catalog.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedId(t.id)}
                className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                  selectedId === t.id ? "border-primary ring-1 ring-primary" : "hover:bg-accent/50"
                }`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <PaletteIcon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{t.name}</span>
                    {t.latestRelease && (
                      <span className="shrink-0 text-xs text-muted-foreground">v{t.latestRelease.version}</span>
                    )}
                  </div>
                  {t.description && <p className="mt-0.5 text-sm text-muted-foreground">{t.description}</p>}
                  {t.category && (
                    <Badge variant="secondary" className="mt-1.5">
                      {t.category}
                    </Badge>
                  )}
                </div>
              </button>
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
