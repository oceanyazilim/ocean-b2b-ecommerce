"use client";

import type { MenuItemSummary, MenuSummary } from "@ocean/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  Checkbox,
  ConfirmDialog,
  Dialog,
  FormField,
  Input,
  Skeleton,
} from "@ocean/ui";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { api, errorMessage } from "@/lib/api";
import { EMPTY_LINK_TARGET, LinkTargetField, type LinkTargetValue } from "@/components/pickers";
import { useSubmit } from "@/lib/use-submit";

// --- editor-local shapes -----------------------------------------------------------------
// The API tree has no stable client identity (a save always replaces the whole item list), so
// the editor works with its own tempId-keyed shapes and flattens them to `MenuItemInput[]`
// (tempId + parentId referencing a sibling's tempId) on submit.

let idSeq = 0;
const makeTempId = () => `tmp_${Date.now().toString(36)}_${idSeq++}`;

interface ColumnLinkDraft {
  tempId: string;
  label: string;
  link: LinkTargetValue;
}

interface ColumnDraft {
  tempId: string;
  heading: string;
  links: ColumnLinkDraft[];
}

interface PromoDraft {
  imageUrl: string;
  imageAlt: string;
  linkLabel: string;
  linkUrl: string;
}

const EMPTY_PROMO: PromoDraft = { imageUrl: "", imageAlt: "", linkLabel: "", linkUrl: "" };

interface TopItemDraft {
  tempId: string;
  label: string;
  link: LinkTargetValue;
  megaMenuEnabled: boolean;
  columns: ColumnDraft[];
  promo: PromoDraft | null;
}

function newTopItem(): TopItemDraft {
  return {
    tempId: makeTempId(),
    label: "",
    link: { ...EMPTY_LINK_TARGET },
    megaMenuEnabled: false,
    columns: [],
    promo: null,
  };
}

function newColumn(): ColumnDraft {
  return { tempId: makeTempId(), heading: "", links: [] };
}

function newColumnLink(): ColumnLinkDraft {
  return { tempId: makeTempId(), label: "", link: { ...EMPTY_LINK_TARGET } };
}

function itemsToDrafts(items: MenuItemSummary[] | undefined): TopItemDraft[] {
  if (!items || items.length === 0) return [newTopItem()];
  return [...items]
    .sort((a, b) => a.position - b.position)
    .map((item) => ({
      tempId: makeTempId(),
      label: item.label,
      link: { url: item.url ?? "", linkType: item.linkType, resourceId: item.resourceId },
      megaMenuEnabled: item.megaMenuEnabled,
      columns: item.megaMenuEnabled
        ? [...item.children]
            .sort((a, b) => a.position - b.position)
            .map((col) => ({
              tempId: makeTempId(),
              heading: col.label,
              links: [...col.children]
                .sort((a, b) => a.position - b.position)
                .map((link) => ({
                  tempId: makeTempId(),
                  label: link.label,
                  link: { url: link.url ?? "", linkType: link.linkType, resourceId: link.resourceId },
                })),
            }))
        : [],
      promo:
        item.megaMenuEnabled && (item.promoImageUrl || item.promoLinkUrl)
          ? {
              imageUrl: item.promoImageUrl ?? "",
              imageAlt: item.promoImageAlt ?? "",
              linkLabel: item.promoLinkLabel ?? "",
              linkUrl: item.promoLinkUrl ?? "",
            }
          : null,
    }));
}

interface FlatMenuItem {
  tempId: string;
  label: string;
  url: string | null;
  position: number;
  parentId: string | null;
  linkType: LinkTargetValue["linkType"];
  resourceId: string | null;
  megaMenuEnabled: boolean;
  promoImageUrl: string | null;
  promoImageAlt: string | null;
  promoLinkLabel: string | null;
  promoLinkUrl: string | null;
}

function draftsToFlatItems(topItems: TopItemDraft[]): FlatMenuItem[] {
  const out: FlatMenuItem[] = [];
  const cleanTopItems = topItems.filter((it) => it.label.trim().length > 0);
  cleanTopItems.forEach((item, idx) => {
    out.push({
      tempId: item.tempId,
      label: item.label.trim(),
      url: item.link.url.trim() || null,
      position: idx,
      parentId: null,
      linkType: item.link.linkType,
      resourceId: item.link.resourceId,
      megaMenuEnabled: item.megaMenuEnabled,
      promoImageUrl: item.megaMenuEnabled ? item.promo?.imageUrl.trim() || null : null,
      promoImageAlt: item.megaMenuEnabled ? item.promo?.imageAlt.trim() || null : null,
      promoLinkLabel: item.megaMenuEnabled ? item.promo?.linkLabel.trim() || null : null,
      promoLinkUrl: item.megaMenuEnabled ? item.promo?.linkUrl.trim() || null : null,
    });
    if (!item.megaMenuEnabled) return;
    const cleanColumns = item.columns.filter((c) => c.heading.trim().length > 0);
    cleanColumns.forEach((col, colIdx) => {
      out.push({
        tempId: col.tempId,
        label: col.heading.trim(),
        url: null,
        position: colIdx,
        parentId: item.tempId,
        linkType: null,
        resourceId: null,
        megaMenuEnabled: false,
        promoImageUrl: null,
        promoImageAlt: null,
        promoLinkLabel: null,
        promoLinkUrl: null,
      });
      const cleanLinks = col.links.filter((l) => l.label.trim().length > 0);
      cleanLinks.forEach((link, linkIdx) => {
        out.push({
          tempId: link.tempId,
          label: link.label.trim(),
          url: link.link.url.trim() || null,
          position: linkIdx,
          parentId: col.tempId,
          linkType: link.link.linkType,
          resourceId: link.link.resourceId,
          megaMenuEnabled: false,
          promoImageUrl: null,
          promoImageAlt: null,
          promoLinkLabel: null,
          promoLinkUrl: null,
        });
      });
    });
  });
  return out;
}

export function MenusManager({ storeId, canWrite }: { storeId: string; canWrite: boolean }) {
  const [rows, setRows] = useState<MenuSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<MenuSummary | "new" | null>(null);
  const [deleting, setDeleting] = useState<MenuSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const action = useSubmit();

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ data: MenuSummary[] }>(`/stores/${storeId}/menus`);
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Navigation menus for the storefront header and footer.</p>
        {canWrite && <Button onClick={() => setEditing("new")}>Add menu</Button>}
      </div>
      {(error ?? action.error) && <Alert variant="error">{error ?? action.error}</Alert>}
      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No menus yet.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((m) => (
            <Card key={m.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <button className="font-medium hover:underline" onClick={() => setEditing(m)}>
                    {m.title}
                  </button>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">/{m.handle}</span>
                    {canWrite && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(m)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleting(m)}>
                          Delete
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {m.items && m.items.length > 0 ? (
                  <ul className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
                    {m.items.map((item) => (
                      <li key={item.id}>
                        {item.label} {item.url && <span className="text-xs">→ {item.url}</span>}
                        {item.megaMenuEnabled && (
                          <Badge variant="outline" className="ml-2">
                            Mega menu · {item.children.length} column{item.children.length === 1 ? "" : "s"}
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">No items.</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <MenuDialog storeId={storeId} editing={editing} onClose={() => setEditing(null)} onSaved={() => void load()} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.title ?? "this menu"}?`}
        destructive
        pending={busyId === deleting?.id}
        onConfirm={async () => {
          if (!deleting) return;
          setBusyId(deleting.id);
          const ok = await action.run(() => api(`/stores/${storeId}/menus/${deleting.id}`, { method: "DELETE" }));
          setBusyId(null);
          if (ok !== undefined) await load();
          setDeleting(null);
        }}
      />
    </div>
  );
}

function MenuDialog({
  storeId,
  editing,
  onClose,
  onSaved,
}: {
  storeId: string;
  editing: MenuSummary | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const submit = useSubmit();
  const { reset } = submit;
  const [title, setTitle] = useState("");
  const [handle, setHandle] = useState("");
  const [items, setItems] = useState<TopItemDraft[]>([newTopItem()]);
  const isNew = editing === "new";
  const current = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    if (editing === null) return;
    reset();
    setTitle(current?.title ?? "");
    setHandle(current?.handle ?? "");
    setItems(itemsToDrafts(current?.items));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `current` is derived from `editing`
  }, [editing, reset]);

  function updateItem(idx: number, patch: Partial<TopItemDraft>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = { title, handle, items: draftsToFlatItems(items) };
    const res = await submit.run(() =>
      isNew
        ? api(`/stores/${storeId}/menus`, { body })
        : api(`/stores/${storeId}/menus/${current?.id}`, { method: "PATCH", body }),
    );
    if (res !== undefined) {
      onSaved();
      onClose();
    }
  }

  return (
    <Dialog
      open={editing !== null}
      onClose={onClose}
      title={isNew ? "Add menu" : "Edit menu"}
      className="max-w-3xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button type="submit" form="menu-form" loading={submit.pending}>
            {isNew ? "Create" : "Save"}
          </Button>
        </>
      }
    >
      <form
        id="menu-form"
        onSubmit={(e) => void onSubmit(e)}
        className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1"
      >
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField id="menu-title" label="Title" error={submit.fieldErrors.title}>
            <Input id="menu-title" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
          </FormField>
          <FormField id="menu-handle" label="Handle" error={submit.fieldErrors.handle}>
            <Input id="menu-handle" value={handle} onChange={(e) => setHandle(e.target.value)} required />
          </FormField>
        </div>
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium">Items</span>
          {items.map((item, idx) => (
            <TopItemEditor
              key={item.tempId}
              storeId={storeId}
              item={item}
              onChange={(patch) => updateItem(idx, patch)}
              onRemove={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
            />
          ))}
          <Button type="button" size="sm" variant="ghost" onClick={() => setItems((prev) => [...prev, newTopItem()])}>
            Add item
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function TopItemEditor({
  storeId,
  item,
  onChange,
  onRemove,
}: {
  storeId: string;
  item: TopItemDraft;
  onChange: (patch: Partial<TopItemDraft>) => void;
  onRemove: () => void;
}) {
  function updateColumn(colIdx: number, patch: Partial<ColumnDraft>) {
    onChange({ columns: item.columns.map((c, i) => (i === colIdx ? { ...c, ...patch } : c)) });
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="flex gap-2">
        <Input
          placeholder="Label"
          value={item.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="flex-1"
        />
        <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
          ✕
        </Button>
      </div>
      <LinkTargetField
        id={`item-link-${item.tempId}`}
        storeId={storeId}
        value={item.link}
        onChange={(link) => onChange({ link })}
        label="Link"
      />
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={item.megaMenuEnabled}
          onChange={(e) => {
            const enabled = e.target.checked;
            onChange({
              megaMenuEnabled: enabled,
              columns: enabled && item.columns.length === 0 ? [newColumn()] : item.columns,
            });
          }}
        />
        Open as mega menu (multi-column dropdown)
      </label>

      {item.megaMenuEnabled && (
        <div className="flex flex-col gap-3 rounded-md border border-dashed p-3">
          <span className="text-sm font-medium">Columns</span>
          {item.columns.map((col, colIdx) => (
            <ColumnEditor
              key={col.tempId}
              storeId={storeId}
              column={col}
              onChange={(patch) => updateColumn(colIdx, patch)}
              onRemove={() => onChange({ columns: item.columns.filter((_, i) => i !== colIdx) })}
            />
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange({ columns: [...item.columns, newColumn()] })}
          >
            Add column
          </Button>

          <div className="flex items-center justify-between border-t pt-3">
            <span className="text-sm font-medium">Featured promo (optional)</span>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={item.promo !== null}
                onChange={(e) => onChange({ promo: e.target.checked ? { ...EMPTY_PROMO } : null })}
              />
              Include image/link block
            </label>
          </div>
          {item.promo && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <FormField id={`promo-image-${item.tempId}`} label="Image URL">
                <Input
                  id={`promo-image-${item.tempId}`}
                  placeholder="https://…/image.jpg"
                  value={item.promo.imageUrl}
                  onChange={(e) => onChange({ promo: { ...item.promo!, imageUrl: e.target.value } })}
                />
              </FormField>
              <FormField id={`promo-alt-${item.tempId}`} label="Image alt text">
                <Input
                  id={`promo-alt-${item.tempId}`}
                  value={item.promo.imageAlt}
                  onChange={(e) => onChange({ promo: { ...item.promo!, imageAlt: e.target.value } })}
                />
              </FormField>
              <FormField id={`promo-label-${item.tempId}`} label="Link label">
                <Input
                  id={`promo-label-${item.tempId}`}
                  value={item.promo.linkLabel}
                  onChange={(e) => onChange({ promo: { ...item.promo!, linkLabel: e.target.value } })}
                />
              </FormField>
              <FormField id={`promo-url-${item.tempId}`} label="Link URL">
                <Input
                  id={`promo-url-${item.tempId}`}
                  placeholder="/collections/new-arrivals"
                  value={item.promo.linkUrl}
                  onChange={(e) => onChange({ promo: { ...item.promo!, linkUrl: e.target.value } })}
                />
              </FormField>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ColumnEditor({
  storeId,
  column,
  onChange,
  onRemove,
}: {
  storeId: string;
  column: ColumnDraft;
  onChange: (patch: Partial<ColumnDraft>) => void;
  onRemove: () => void;
}) {
  function updateLink(linkIdx: number, patch: Partial<ColumnLinkDraft>) {
    onChange({ links: column.links.map((l, i) => (i === linkIdx ? { ...l, ...patch } : l)) });
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
      <div className="flex gap-2">
        <Input
          placeholder="Column heading"
          value={column.heading}
          onChange={(e) => onChange({ heading: e.target.value })}
          className="flex-1"
        />
        <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
          Remove column
        </Button>
      </div>
      <div className="flex flex-col gap-2 pl-3">
        {column.links.map((link, linkIdx) => (
          <div key={link.tempId} className="flex flex-col gap-1 rounded border bg-background p-2">
            <div className="flex gap-2">
              <Input
                placeholder="Link label"
                value={link.label}
                onChange={(e) => updateLink(linkIdx, { label: e.target.value })}
                className="flex-1"
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onChange({ links: column.links.filter((_, i) => i !== linkIdx) })}
              >
                ✕
              </Button>
            </div>
            <LinkTargetField
              id={`col-link-${link.tempId}`}
              storeId={storeId}
              value={link.link}
              onChange={(v) => updateLink(linkIdx, { link: v })}
              label="Link"
            />
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => onChange({ links: [...column.links, newColumnLink()] })}
        >
          Add link
        </Button>
      </div>
    </div>
  );
}
