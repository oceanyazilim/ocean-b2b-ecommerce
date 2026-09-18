"use client";

import type { StoreThemeDetail, StoreThemeVersionDetail } from "@ocean/types";
import { Alert, Badge, Button, Card, CardContent, ConfirmDialog, FormField, Skeleton } from "@ocean/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { ThemeSettingInput } from "@/components/theme-setting-input";
import { api, errorMessage } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

export function ThemeDetail({
  storeId,
  storeSlug,
  storeThemeId,
  canEdit,
  canPublish,
}: {
  storeId: string;
  storeSlug: string;
  storeThemeId: string;
  canEdit: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<StoreThemeDetail | null>(null);
  const [draftVersion, setDraftVersion] = useState<StoreThemeVersionDetail | null>(null);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const saveAction = useSubmit();
  const publishAction = useSubmit();
  const deleteAction = useSubmit();

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = (await api<{ data: StoreThemeDetail }>(`/stores/${storeId}/themes/${storeThemeId}`)).data;
      setDetail(d);
      const draft = d.versions.find((v) => v.status === "draft") ?? null;
      if (draft) {
        const v = (
          await api<{ data: StoreThemeVersionDetail }>(
            `/stores/${storeId}/themes/${storeThemeId}/versions/${draft.id}`,
          )
        ).data;
        setDraftVersion(v);
        setSettings(v.globalSettings);
      } else {
        setDraftVersion(null);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [storeId, storeThemeId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveSettings() {
    if (!draftVersion) return;
    const ok = await saveAction.run(() =>
      api(`/stores/${storeId}/themes/${storeThemeId}/versions/${draftVersion.id}/settings`, {
        method: "PATCH",
        body: { globalSettings: settings },
      }),
    );
    if (ok !== undefined) await load();
  }

  async function publish() {
    if (!draftVersion) return;
    const ok = await publishAction.run(() =>
      api(`/stores/${storeId}/themes/${storeThemeId}/versions/${draftVersion.id}/publish`, { method: "POST" }),
    );
    if (ok !== undefined) await load();
  }

  if (loading) return <Skeleton className="h-64 w-full" />;
  if (error || !detail) return <Alert variant="error">{error ?? "Theme not found."}</Alert>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/${storeSlug}/storefront/themes`} className="text-sm text-muted-foreground hover:underline">
            ← Themes
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {detail.name} <Badge variant={detail.role === "main" ? "success" : "secondary"}>{detail.role}</Badge>
          </h1>
          <p className="text-sm text-muted-foreground">Based on {detail.themeName}</p>
        </div>
        <div className="flex gap-2">
          {canPublish && draftVersion && (
            <Button onClick={() => void publish()} loading={publishAction.pending}>
              Publish draft
            </Button>
          )}
          {canEdit && (
            <Button variant="ghost" onClick={() => setDeleting(true)}>
              Delete
            </Button>
          )}
        </div>
      </div>
      {publishAction.error && <Alert variant="error">{publishAction.error}</Alert>}
      {deleteAction.error && <Alert variant="error">{deleteAction.error}</Alert>}

      {!draftVersion ? (
        <Alert variant="warning">No draft version to edit.</Alert>
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-4 py-6">
            <h2 className="text-lg font-semibold">Theme settings (draft, version {draftVersion.number})</h2>
            {detail.manifest.globalSettings.length === 0 ? (
              <p className="text-sm text-muted-foreground">This theme has no global settings.</p>
            ) : (
              detail.manifest.globalSettings.map((field) => (
                <FormField key={field.key} id={`setting-${field.key}`} label={field.label}>
                  <ThemeSettingInput
                    field={field}
                    value={settings[field.key]}
                    onChange={(value) => setSettings((prev) => ({ ...prev, [field.key]: value }))}
                    disabled={!canEdit}
                  />
                </FormField>
              ))
            )}
            {saveAction.error && <Alert variant="error">{saveAction.error}</Alert>}
            {canEdit && (
              <div>
                <Button onClick={() => void saveSettings()} loading={saveAction.pending}>
                  Save settings
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-col gap-2 py-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Templates</h2>
            {draftVersion && (
              <Link href={`/${storeSlug}/storefront/themes/${storeThemeId}/editor`}>
                <Button size="sm">Open editor</Button>
              </Link>
            )}
          </div>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {(draftVersion?.templates ?? []).map((t) => (
              <li key={t.id} className="flex items-center justify-between border-b py-1.5 last:border-0">
                <span>{t.templateName === "default" ? t.templateType : `${t.templateType} / ${t.templateName}`}</span>
                <span className="text-muted-foreground">
                  {Object.keys(t.configuration.sections).length} section
                  {Object.keys(t.configuration.sections).length === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title={`Delete ${detail.name}?`}
        description={detail.role === "main" ? "The live theme can't be deleted." : undefined}
        destructive
        pending={deleteAction.pending}
        onConfirm={async () => {
          const ok = await deleteAction.run(() => api(`/stores/${storeId}/themes/${storeThemeId}`, { method: "DELETE" }));
          if (ok !== undefined) {
            setDeleting(false);
            router.push(`/${storeSlug}/storefront/themes`);
          }
        }}
      />
    </div>
  );
}
