"use client";

import type { StoreThemeDetail, StoreThemeVersionDetail, TemplateConfiguration, ThemeTemplateVersion } from "@ocean/types";
import {
  Alert,
  Button,
  cn,
  ExternalLinkIcon,
  HistoryIcon,
  MobileIcon,
  MonitorIcon,
  Select,
  Skeleton,
  Tabs,
  TabletIcon,
  UploadCloudIcon,
} from "@ocean/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api, errorMessage } from "@/lib/api";
import { buildPreviewUrl, mintPreviewToken, resolveStorefrontBase } from "@/lib/theme-preview";
import { useSubmit } from "@/lib/use-submit";

import { ThemeEditorPanel } from "./theme-editor-panel";
import { ThemeEditorTree } from "./theme-editor-tree";
import type { Selection } from "./types";

const TEMPLATE_NAME = "default";
const SAVE_DEBOUNCE_MS = 900;
type Viewport = "desktop" | "tablet" | "mobile";
const VIEWPORT_WIDTH: Record<Viewport, number | undefined> = { desktop: undefined, tablet: 820, mobile: 390 };

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
  const [leftTab, setLeftTab] = useState<"sections" | "settings">("sections");
  const [selection, setSelection] = useState<Selection>({ kind: "global" });
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [previewBaseUrl, setPreviewBaseUrl] = useState<string | null>(null);
  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const [previewNote, setPreviewNote] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [openingPreview, setOpeningPreview] = useState(false);
  const publishAction = useSubmit();
  const rollbackAction = useSubmit();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<null | (() => Promise<void>)>(null);
  const historyRef = useRef<HTMLDivElement>(null);

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

      const [token, base] = await Promise.all([
        mintPreviewToken(storeId, storeThemeId, draft.id),
        resolveStorefrontBase(storeId),
      ]);
      if (base) {
        setPreviewBaseUrl(base);
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

  useEffect(() => {
    if (!historyOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) setHistoryOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [historyOpen]);

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
    const run = async () => {
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
      pendingSaveRef.current = null;
    };
    pendingSaveRef.current = run;
    saveTimer.current = setTimeout(() => void run(), SAVE_DEBOUNCE_MS);
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
    const run = async () => {
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
      pendingSaveRef.current = null;
    };
    pendingSaveRef.current = run;
    saveTimer.current = setTimeout(() => void run(), SAVE_DEBOUNCE_MS);
  }

  // "Save" in the toolbar doesn't add a second save path — it flushes the debounced autosave
  // that's already pending (or is a no-op if everything's already saved), so there's exactly
  // one write path to reason about.
  function saveNow() {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (pendingSaveRef.current) void pendingSaveRef.current();
  }

  async function publish() {
    if (!version) return;
    saveNow();
    const ok = await publishAction.run(() =>
      api(`/stores/${storeId}/themes/${storeThemeId}/versions/${version.id}/publish`, { method: "POST" }),
    );
    if (ok !== undefined) router.push(`/${storeSlug}/storefront/themes/${storeThemeId}`);
  }

  async function restoreVersion(versionId: string) {
    const ok = await rollbackAction.run(() =>
      api(`/stores/${storeId}/themes/${storeThemeId}/versions/${versionId}/rollback`, { method: "POST" }),
    );
    if (ok !== undefined) {
      setHistoryOpen(false);
      await load();
    }
  }

  async function openLivePreview() {
    if (!version) return;
    setOpeningPreview(true);
    try {
      const url = await buildPreviewUrl(storeId, storeThemeId, version.id, iframePath);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setOpeningPreview(false);
    }
  }

  if (loading) return <Skeleton className="h-[70vh] w-full" />;
  if (error || !detail) return <Alert variant="error">{error ?? "Theme not found."}</Alert>;
  if (!version) return <Alert variant="warning">No draft version to edit.</Alert>;

  const pastVersions = [...detail.versions].sort((a, b) => b.number - a.number).filter((v) => v.status !== "draft");

  return (
    <div className="flex h-[calc(100vh-2.5rem)] flex-col gap-0 bg-canvas">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={`/${storeSlug}/storefront/themes`}
            className="shrink-0 text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            ← Themes
          </Link>
          <span className="h-4 w-px shrink-0 bg-border" />
          <span className="truncate text-sm font-semibold">{detail.name}</span>
        </div>

        <div className="flex items-center gap-2">
          <Select
            aria-label="Page"
            value={templateType}
            onChange={(e) => {
              setTemplateType(e.target.value);
              setSelection({ kind: "global" });
            }}
            className="w-40"
          >
            {detail.manifest.templates.map((t) => (
              <option key={t.type} value={t.type}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved ✓" : saveStatus === "error" ? "Save failed" : ""}
          </span>

          <div className="relative" ref={historyRef}>
            <Button variant="outline" size="sm" onClick={() => setHistoryOpen((v) => !v)}>
              <HistoryIcon size={15} />
              History
            </Button>
            {historyOpen && (
              <div className="absolute right-0 z-50 mt-1.5 w-72 rounded-md border bg-background py-1 shadow-popover">
                <div className="border-b px-3 py-2">
                  <p className="text-xs font-medium">Version history</p>
                  <p className="text-xs text-muted-foreground">
                    Restore copies a version&apos;s settings and pages over your current draft.
                  </p>
                </div>
                {rollbackAction.error && (
                  <p className="px-3 py-1.5 text-xs text-destructive">{rollbackAction.error}</p>
                )}
                <div className="max-h-64 overflow-y-auto">
                  {pastVersions.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">No earlier versions yet.</p>
                  ) : (
                    pastVersions.map((v) => (
                      <div key={v.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm hover:bg-accent/50">
                        <div className="min-w-0">
                          <p className="truncate">
                            Version {v.number} <span className="text-xs text-muted-foreground">· {v.status}</span>
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {v.publishedAt ? new Date(v.publishedAt).toLocaleString() : "Never published"}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={rollbackAction.pending}
                          onClick={() => void restoreVersion(v.id)}
                          className="shrink-0 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                        >
                          Restore
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex rounded-md border p-0.5">
            {(
              [
                { key: "desktop", icon: MonitorIcon, label: "Desktop" },
                { key: "tablet", icon: TabletIcon, label: "Tablet" },
                { key: "mobile", icon: MobileIcon, label: "Mobile" },
              ] as const
            ).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                type="button"
                aria-label={label}
                aria-pressed={viewport === key}
                onClick={() => setViewport(key)}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded",
                  viewport === key ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50",
                )}
              >
                <Icon size={15} />
              </button>
            ))}
          </div>

          <Button variant="outline" size="sm" onClick={() => void openLivePreview()} loading={openingPreview}>
            <ExternalLinkIcon size={15} />
            Preview
          </Button>

          <Button variant="outline" size="sm" onClick={saveNow}>
            Save
          </Button>

          {canPublish && (
            <Button size="sm" onClick={() => void publish()} loading={publishAction.pending}>
              <UploadCloudIcon size={15} />
              Publish
            </Button>
          )}
        </div>
      </div>
      {publishAction.error && (
        <div className="px-4 pt-2">
          <Alert variant="error">{publishAction.error}</Alert>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[240px_1fr_300px] overflow-hidden">
        <div className="flex flex-col overflow-hidden border-r bg-background">
          <Tabs
            className="px-2 pt-1"
            aria-label="Editor panel"
            value={leftTab}
            onChange={(v) => {
              setLeftTab(v);
              if (v === "settings") setSelection({ kind: "global" });
            }}
            items={[
              { value: "sections", label: "Sections" },
              { value: "settings", label: "Theme settings" },
            ]}
          />
          <div className="flex-1 overflow-y-auto">
            {leftTab === "sections" ? (
              <ThemeEditorTree
                manifest={detail.manifest}
                templateType={templateType}
                config={config}
                selection={selection}
                onSelect={(s) => {
                  setSelection(s);
                  setLeftTab("sections");
                }}
                onChange={onChangeConfig}
              />
            ) : (
              <div className="p-3 text-sm text-muted-foreground">
                Global design tokens — logo, colors, and typography — are shown in the panel on the right and apply
                across every page.
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-center overflow-auto bg-muted/30 p-4">
          {previewSrc ? (
            <iframe
              src={previewSrc}
              title="Theme preview"
              className="h-full rounded-md border bg-background shadow-sm transition-[width] duration-200"
              style={{ width: VIEWPORT_WIDTH[viewport] ?? "100%" }}
            />
          ) : (
            <p className="max-w-xs text-center text-sm text-muted-foreground">{previewNote}</p>
          )}
        </div>

        <div className="overflow-y-auto border-l bg-background">
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
