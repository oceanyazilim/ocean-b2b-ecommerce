"use client";

import type {
  DomainSummary,
  StoreThemeDetail,
  StoreThemeVersionDetail,
  TemplateConfiguration,
  ThemeTemplateVersion,
} from "@ocean/types";
import { Alert, Button, Select, Skeleton } from "@ocean/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api, errorMessage } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

import { ThemeEditorPanel } from "./theme-editor-panel";
import { ThemeEditorTree } from "./theme-editor-tree";
import type { Selection } from "./types";

const TEMPLATE_NAME = "default";
const SAVE_DEBOUNCE_MS = 900;

function previewBase(hostname: string): string {
  return hostname.endsWith(".localhost") ? `http://${hostname}:3002` : `https://${hostname}`;
}

export function ThemeEditor({
  storeId,
  storeSlug,
  storeThemeId,
  canPublish,
}: {
  storeId: string;
  storeSlug: string;
  storeThemeId: string;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<StoreThemeDetail | null>(null);
  const [version, setVersion] = useState<StoreThemeVersionDetail | null>(null);
  const [templateType, setTemplateType] = useState("home");
  const [selection, setSelection] = useState<Selection>({ kind: "global" });
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [previewBaseUrl, setPreviewBaseUrl] = useState<string | null>(null);
  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const [previewNote, setPreviewNote] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const publishAction = useSubmit();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = (await api<{ data: StoreThemeDetail }>(`/stores/${storeId}/themes/${storeThemeId}`)).data;
      setDetail(d);
      const draft = d.versions.find((v) => v.status === "draft");
      if (!draft) {
        setVersion(null);
        return;
      }
      const v = (
        await api<{ data: StoreThemeVersionDetail }>(`/stores/${storeId}/themes/${storeThemeId}/versions/${draft.id}`)
      ).data;
      setVersion(v);

      const [{ token }, domains] = await Promise.all([
        api<{ data: { token: string } }>(
          `/stores/${storeId}/themes/${storeThemeId}/versions/${draft.id}/preview-token`,
          { method: "POST" },
        ).then((r) => r.data),
        api<{ data: DomainSummary[] }>(`/stores/${storeId}/domains`).then((r) => r.data),
      ]);
      const domain = domains.find((d2) => d2.isPrimary) ?? domains[0];
      if (domain) {
        setPreviewBaseUrl(previewBase(domain.hostname));
        setPreviewToken(token);
        setPreviewNote(null);
      } else {
        setPreviewBaseUrl(null);
        setPreviewToken(null);
        setPreviewNote("Add a domain under Storefront → Domains to see a live preview.");
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

  const currentTemplate: ThemeTemplateVersion | undefined = version?.templates.find(
    (t) => t.templateType === templateType && t.templateName === TEMPLATE_NAME,
  );
  const config: TemplateConfiguration = currentTemplate?.configuration ?? { sections: {}, sectionOrder: [] };

  const iframePath = useMemo(() => {
    switch (templateType) {
      case "cart":
        return "/cart";
      case "home":
      default:
        return "/";
    }
  }, [templateType]);

  const previewSrc =
    previewBaseUrl && previewToken
      ? `${previewBaseUrl}${iframePath}?preview_token=${previewToken}&_r=${reloadNonce}`
      : null;

  // The iframe is cross-origin (admin on one port/domain, storefront on another), so
  // contentWindow.location.reload() is blocked by the same-origin policy — bumping a nonce
  // that's part of the `src` itself is the reliable way to force a renavigation instead.
  function reloadPreview() {
    setReloadNonce((n) => n + 1);
  }

  function scheduleSave(nextConfig: TemplateConfiguration) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus("saving");
    saveTimer.current = setTimeout(() => {
      void (async () => {
        try {
          await api(`/stores/${storeId}/themes/${storeThemeId}/versions/${version?.id}/templates/${templateType}/${TEMPLATE_NAME}`, {
            method: "PATCH",
            body: { configuration: nextConfig },
          });
          setSaveStatus("saved");
          reloadPreview();
        } catch {
          setSaveStatus("error");
        }
      })();
    }, SAVE_DEBOUNCE_MS);
  }

  function onChangeConfig(next: TemplateConfiguration) {
    if (!version) return;
    setVersion({
      ...version,
      templates: version.templates.some((t) => t.templateType === templateType && t.templateName === TEMPLATE_NAME)
        ? version.templates.map((t) =>
            t.templateType === templateType && t.templateName === TEMPLATE_NAME ? { ...t, configuration: next } : t,
          )
        : [...version.templates, { id: `local-${templateType}`, templateType, templateName: TEMPLATE_NAME, configuration: next }],
    });
    scheduleSave(next);
  }

  function scheduleSaveGlobalSettings(next: Record<string, unknown>) {
    if (!version) return;
    setVersion({ ...version, globalSettings: next });
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus("saving");
    saveTimer.current = setTimeout(() => {
      void (async () => {
        try {
          await api(`/stores/${storeId}/themes/${storeThemeId}/versions/${version.id}/settings`, {
            method: "PATCH",
            body: { globalSettings: next },
          });
          setSaveStatus("saved");
          reloadPreview();
        } catch {
          setSaveStatus("error");
        }
      })();
    }, SAVE_DEBOUNCE_MS);
  }

  async function publish() {
    if (!version) return;
    const ok = await publishAction.run(() =>
      api(`/stores/${storeId}/themes/${storeThemeId}/versions/${version.id}/publish`, { method: "POST" }),
    );
    if (ok !== undefined) router.push(`/${storeSlug}/storefront/themes/${storeThemeId}`);
  }

  if (loading) return <Skeleton className="h-[70vh] w-full" />;
  if (error || !detail) return <Alert variant="error">{error ?? "Theme not found."}</Alert>;
  if (!version) return <Alert variant="warning">No draft version to edit.</Alert>;

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href={`/${storeSlug}/storefront/themes/${storeThemeId}`} className="text-sm text-muted-foreground hover:underline">
            ← {detail.name}
          </Link>
          <Select value={templateType} onChange={(e) => { setTemplateType(e.target.value); setSelection({ kind: "global" }); }} className="w-40">
            {detail.manifest.templates.map((t) => (
              <option key={t.type} value={t.type}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved ✓" : saveStatus === "error" ? "Save failed" : ""}
          </span>
          <div className="flex rounded-md border">
            <button
              type="button"
              onClick={() => setViewport("desktop")}
              className={`px-2 py-1 text-xs ${viewport === "desktop" ? "bg-accent" : ""}`}
            >
              Desktop
            </button>
            <button
              type="button"
              onClick={() => setViewport("mobile")}
              className={`px-2 py-1 text-xs ${viewport === "mobile" ? "bg-accent" : ""}`}
            >
              Mobile
            </button>
          </div>
          {canPublish && (
            <Button onClick={() => void publish()} loading={publishAction.pending}>
              Publish
            </Button>
          )}
        </div>
      </div>
      {publishAction.error && <Alert variant="error">{publishAction.error}</Alert>}

      <div className="grid min-h-0 flex-1 grid-cols-[220px_1fr_280px] gap-3 overflow-hidden rounded-md border">
        <div className="overflow-y-auto border-r">
          <ThemeEditorTree
            manifest={detail.manifest}
            templateType={templateType}
            config={config}
            selection={selection}
            onSelect={setSelection}
            onChange={onChangeConfig}
          />
        </div>
        <div className="flex items-center justify-center overflow-auto bg-muted/40 p-4">
          {previewSrc ? (
            <iframe
              src={previewSrc}
              title="Theme preview"
              className="h-full rounded-md border bg-background shadow-sm"
              style={{ width: viewport === "mobile" ? 390 : "100%" }}
            />
          ) : (
            <p className="max-w-xs text-center text-sm text-muted-foreground">{previewNote}</p>
          )}
        </div>
        <div className="overflow-y-auto border-l">
          <ThemeEditorPanel
            manifest={detail.manifest}
            config={config}
            selection={selection}
            globalSettings={version.globalSettings}
            onChangeGlobalSettings={scheduleSaveGlobalSettings}
            onChangeConfig={onChangeConfig}
          />
        </div>
      </div>
    </div>
  );
}
