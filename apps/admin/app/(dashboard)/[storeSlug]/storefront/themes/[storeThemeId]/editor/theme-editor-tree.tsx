"use client";

import type {
  TemplateConfiguration,
  ThemeBlockInstance,
  ThemeBlockManifest,
  ThemeManifest,
  ThemeSectionInstance,
  ThemeSectionManifest,
} from "@ocean/types";
import {
  BlockIcon,
  Button,
  ClickIcon,
  cn,
  DragHandleIcon,
  DuplicateIcon,
  EyeIcon,
  EyeOffIcon,
  ImageIcon,
  Input,
  LayersIcon,
  MoreHorizontalIcon,
  PaletteIcon,
  PlusIcon,
  TrashIcon,
  TypeIcon,
} from "@ocean/ui";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { Selection } from "./types";

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

// Icon per section/block type is a heuristic over the manifest's `type` string (there's no
// icon field in the manifest) — good enough to make the tree and the add-section library
// scannable without fabricating imagery the manifest doesn't provide.
function iconForType(type: string) {
  const t = type.toLowerCase();
  if (t.includes("hero") || t.includes("banner")) return LayersIcon;
  if (t.includes("image")) return ImageIcon;
  if (t.includes("button")) return ClickIcon;
  if (t.includes("text") || t.includes("heading") || t.includes("rich")) return TypeIcon;
  if (t.includes("color") || t.includes("style")) return PaletteIcon;
  return BlockIcon;
}

// A flat, native-HTML5-drag-and-drop reorderable list — no dnd library needed for a single
// level of "drag this row above/below that row" within sectionOrder or one section's blockOrder.
function useDragReorder(order: string[], onReorder: (next: string[]) => void) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  return {
    draggingId,
    onDragStart: (id: string) => setDraggingId(id),
    onDragEnd: () => setDraggingId(null),
    onDropOn: (targetId: string) => {
      if (!draggingId || draggingId === targetId) return;
      const from = order.indexOf(draggingId);
      const to = order.indexOf(targetId);
      if (from === -1 || to === -1) return;
      const next = [...order];
      next.splice(from, 1);
      next.splice(to, 0, draggingId);
      onReorder(next);
      setDraggingId(null);
    },
  };
}

// A small anchored popover used for both the "⋯" contextual menu and the "+ Add" pickers —
// closes on outside click, matching the pattern already used by the notification bell.
function Popover({
  trigger,
  align = "start",
  children,
}: {
  trigger: ReactNode;
  align?: "start" | "end";
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <span onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>{trigger}</span>
      {open && (
        <div
          className={cn(
            "absolute z-50 mt-1 min-w-[10rem] rounded-md border bg-background py-1 shadow-popover",
            align === "end" ? "right-0" : "left-0",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  destructive,
  disabled,
  title,
  onSelect,
}: {
  icon: ReactNode;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  title?: string | undefined;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
        destructive ? "text-destructive" : "text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export function ThemeEditorTree({
  manifest,
  templateType,
  config,
  selection,
  onSelect,
  onChange,
}: {
  manifest: ThemeManifest;
  templateType: string;
  config: TemplateConfiguration;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onChange: (next: TemplateConfiguration) => void;
}) {
  const [addingSection, setAddingSection] = useState(false);
  const template = manifest.templates.find((t) => t.type === templateType);
  const allowedSectionTypes: ThemeSectionManifest[] =
    template && template.sections.length > 0
      ? manifest.sections.filter((s) => template.sections.includes(s.type))
      : manifest.sections;

  const visibleOrder = config.sectionOrder;
  const hiddenIds = useMemo(
    () => Object.keys(config.sections).filter((id) => !visibleOrder.includes(id)),
    [config.sections, visibleOrder],
  );

  const sectionDrag = useDragReorder(visibleOrder, (sectionOrder) => onChange({ ...config, sectionOrder }));

  function addSection(type: string) {
    const sectionManifest = manifest.sections.find((s) => s.type === type);
    if (!sectionManifest) return;
    const id = randomId("s");
    const settings = Object.fromEntries(sectionManifest.settings.map((f) => [f.key, f.default ?? null]));
    onChange({
      sections: { ...config.sections, [id]: { type, settings, blocks: {}, blockOrder: [] } },
      sectionOrder: [...config.sectionOrder, id],
    });
    setAddingSection(false);
    onSelect({ kind: "section", sectionId: id });
  }

  function duplicateSection(id: string) {
    const source = config.sections[id];
    if (!source) return;
    const newId = randomId("s");
    const idx = config.sectionOrder.indexOf(id);
    const nextOrder = [...config.sectionOrder];
    nextOrder.splice(idx === -1 ? nextOrder.length : idx + 1, 0, newId);
    onChange({ sections: { ...config.sections, [newId]: structuredClone(source) }, sectionOrder: nextOrder });
    onSelect({ kind: "section", sectionId: newId });
  }

  // Hiding a section means dropping it from `sectionOrder` while keeping its configuration in
  // `sections` — the storefront renderer walks `sectionOrder` only (falling back to
  // Object.keys(sections) exactly when sectionOrder is empty), so this is a real, working
  // hide/show, not a cosmetic one. That fallback also means the *last* visible section can't be
  // hidden this way (it would empty the order and the renderer would show everything again), so
  // that action is disabled rather than offered and silently failing.
  function hideSection(id: string) {
    if (config.sectionOrder.length <= 1) return;
    onChange({ ...config, sectionOrder: config.sectionOrder.filter((s) => s !== id) });
  }

  function showSection(id: string) {
    onChange({ ...config, sectionOrder: [...config.sectionOrder, id] });
  }

  function removeSection(id: string) {
    const { [id]: _removed, ...rest } = config.sections;
    onChange({ sections: rest, sectionOrder: config.sectionOrder.filter((s) => s !== id) });
    if (selection.kind !== "global" && selection.sectionId === id) onSelect({ kind: "global" });
  }

  function updateSection(sectionId: string, section: ThemeSectionInstance) {
    onChange({ ...config, sections: { ...config.sections, [sectionId]: section } });
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <button
        type="button"
        onClick={() => onSelect({ kind: "global" })}
        className={cn(
          "flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors",
          selection.kind === "global" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        )}
      >
        <PaletteIcon size={16} />
        Theme settings
      </button>

      <div>
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sections</span>
          <Button size="sm" variant="ghost" onClick={() => setAddingSection(true)}>
            <PlusIcon size={14} />
            Add
          </Button>
        </div>

        {visibleOrder.length === 0 && hiddenIds.length === 0 && (
          <p className="px-1 py-3 text-sm text-muted-foreground">No sections yet — add one to get started.</p>
        )}

        <div className="mt-1 flex flex-col gap-1">
          {visibleOrder.map((sectionId) => {
            const section = config.sections[sectionId];
            if (!section) return null;
            return (
              <SectionRow
                key={sectionId}
                sectionId={sectionId}
                section={section}
                manifest={manifest}
                selection={selection}
                dragging={sectionDrag.draggingId === sectionId}
                canHide={config.sectionOrder.length > 1}
                onDragStart={() => sectionDrag.onDragStart(sectionId)}
                onDragEnd={sectionDrag.onDragEnd}
                onDropOn={() => sectionDrag.onDropOn(sectionId)}
                onSelect={onSelect}
                onDuplicate={() => duplicateSection(sectionId)}
                onHide={() => hideSection(sectionId)}
                onRemove={() => removeSection(sectionId)}
                onUpdateSection={(next) => updateSection(sectionId, next)}
              />
            );
          })}
        </div>

        {hiddenIds.length > 0 && (
          <div className="mt-3 flex flex-col gap-1 border-t pt-2">
            <span className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Hidden ({hiddenIds.length})
            </span>
            {hiddenIds.map((sectionId) => {
              const section = config.sections[sectionId];
              if (!section) return null;
              const sectionManifest = manifest.sections.find((s) => s.type === section.type);
              const Icon = iconForType(section.type);
              const selected = selection.kind !== "global" && selection.sectionId === sectionId;
              return (
                <div
                  key={sectionId}
                  className={cn(
                    "flex items-center justify-between gap-1 rounded-md px-2 py-1.5 text-sm text-muted-foreground",
                    selected ? "bg-accent" : "hover:bg-accent/50",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelect({ kind: "section", sectionId })}
                    className="flex flex-1 items-center gap-2 truncate text-left"
                  >
                    <Icon size={15} />
                    <span className="truncate">{sectionManifest?.label ?? section.type}</span>
                  </button>
                  <Popover trigger={<button type="button" className="rounded p-1 hover:bg-accent" aria-label="Section options"><MoreHorizontalIcon size={15} /></button>} align="end">
                    {(close) => (
                      <>
                        <MenuItem icon={<EyeIcon size={14} />} label="Show" onSelect={() => { showSection(sectionId); close(); }} />
                        <MenuItem icon={<TrashIcon size={14} />} label="Delete" destructive onSelect={() => { removeSection(sectionId); close(); }} />
                      </>
                    )}
                  </Popover>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AddSectionDialog
        open={addingSection}
        onClose={() => setAddingSection(false)}
        sections={allowedSectionTypes}
        onAdd={addSection}
      />
    </div>
  );
}

function SectionRow({
  sectionId,
  section,
  manifest,
  selection,
  dragging,
  canHide,
  onDragStart,
  onDragEnd,
  onDropOn,
  onSelect,
  onDuplicate,
  onHide,
  onRemove,
  onUpdateSection,
}: {
  sectionId: string;
  section: ThemeSectionInstance;
  manifest: ThemeManifest;
  selection: Selection;
  dragging: boolean;
  canHide: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropOn: () => void;
  onSelect: (s: Selection) => void;
  onDuplicate: () => void;
  onHide: () => void;
  onRemove: () => void;
  onUpdateSection: (next: ThemeSectionInstance) => void;
}) {
  const sectionManifest = manifest.sections.find((s) => s.type === section.type);
  const selected = selection.kind === "section" && selection.sectionId === sectionId;
  const blockDrag = useDragReorder(section.blockOrder, (blockOrder) => onUpdateSection({ ...section, blockOrder }));
  const allowedBlockTypes: ThemeBlockManifest[] = manifest.blocks.filter((b) => sectionManifest?.blocks.includes(b.type));
  const hiddenBlockIds = Object.keys(section.blocks).filter((id) => !section.blockOrder.includes(id));
  const Icon = iconForType(section.type);

  function addBlock(type: string) {
    const blockManifest = manifest.blocks.find((b) => b.type === type);
    if (!blockManifest) return;
    const id = randomId("b");
    const settings = Object.fromEntries(blockManifest.settings.map((f) => [f.key, f.default ?? null]));
    onUpdateSection({
      ...section,
      blocks: { ...section.blocks, [id]: { type, settings } },
      blockOrder: [...section.blockOrder, id],
    });
    onSelect({ kind: "block", sectionId, blockId: id });
  }

  function duplicateBlock(blockId: string) {
    const source = section.blocks[blockId];
    if (!source) return;
    const newId = randomId("b");
    const idx = section.blockOrder.indexOf(blockId);
    const nextOrder = [...section.blockOrder];
    nextOrder.splice(idx === -1 ? nextOrder.length : idx + 1, 0, newId);
    onUpdateSection({ ...section, blocks: { ...section.blocks, [newId]: structuredClone(source) }, blockOrder: nextOrder });
    onSelect({ kind: "block", sectionId, blockId: newId });
  }

  function hideBlock(blockId: string) {
    if (section.blockOrder.length <= 1) return;
    onUpdateSection({ ...section, blockOrder: section.blockOrder.filter((b) => b !== blockId) });
  }

  function showBlock(blockId: string) {
    onUpdateSection({ ...section, blockOrder: [...section.blockOrder, blockId] });
  }

  function removeBlock(blockId: string) {
    const { [blockId]: _removed, ...rest } = section.blocks;
    onUpdateSection({ ...section, blocks: rest, blockOrder: section.blockOrder.filter((b) => b !== blockId) });
    if (selection.kind === "block" && selection.sectionId === sectionId && selection.blockId === blockId) {
      onSelect({ kind: "global" });
    }
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropOn}
      className={cn("rounded-md border bg-card transition-opacity", dragging && "opacity-40")}
    >
      <div className={cn("flex items-center gap-1 rounded-t-md px-1.5 py-1.5", selected ? "bg-accent" : "hover:bg-accent/50")}>
        <span className="cursor-grab px-0.5 text-muted-foreground" title="Drag to reorder">
          <DragHandleIcon size={14} />
        </span>
        <button
          type="button"
          onClick={() => onSelect({ kind: "section", sectionId })}
          className="flex flex-1 items-center gap-2 truncate text-left text-sm"
        >
          <Icon size={15} className="shrink-0 text-muted-foreground" />
          <span className="truncate">{sectionManifest?.label ?? section.type}</span>
        </button>
        <Popover trigger={<button type="button" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Section options"><MoreHorizontalIcon size={15} /></button>} align="end">
          {(close) => (
            <>
              <MenuItem icon={<DuplicateIcon size={14} />} label="Duplicate" onSelect={() => { onDuplicate(); close(); }} />
              <MenuItem
                icon={<EyeOffIcon size={14} />}
                label="Hide"
                disabled={!canHide}
                title={!canHide ? "At least one section must stay visible" : undefined}
                onSelect={() => { onHide(); close(); }}
              />
              <MenuItem icon={<TrashIcon size={14} />} label="Delete" destructive onSelect={() => { onRemove(); close(); }} />
            </>
          )}
        </Popover>
      </div>

      {(allowedBlockTypes.length > 0 || section.blockOrder.length > 0) && (
        <div className="flex flex-col gap-0.5 border-t px-1.5 py-1">
          {section.blockOrder.map((blockId) => {
            const block = section.blocks[blockId];
            if (!block) return null;
            return (
              <BlockRow
                key={blockId}
                sectionId={sectionId}
                blockId={blockId}
                block={block}
                manifest={manifest}
                selection={selection}
                dragging={blockDrag.draggingId === blockId}
                canHide={section.blockOrder.length > 1}
                onDragStart={() => blockDrag.onDragStart(blockId)}
                onDragEnd={blockDrag.onDragEnd}
                onDropOn={() => blockDrag.onDropOn(blockId)}
                onSelect={onSelect}
                onDuplicate={() => duplicateBlock(blockId)}
                onHide={() => hideBlock(blockId)}
                onRemove={() => removeBlock(blockId)}
              />
            );
          })}

          {hiddenBlockIds.map((blockId) => {
            const block = section.blocks[blockId];
            if (!block) return null;
            const blockManifest = manifest.blocks.find((b) => b.type === block.type);
            const selected2 = selection.kind === "block" && selection.sectionId === sectionId && selection.blockId === blockId;
            return (
              <div
                key={blockId}
                className={cn(
                  "flex items-center justify-between gap-1 rounded px-2 py-1 text-xs text-muted-foreground",
                  selected2 ? "bg-accent" : "hover:bg-accent/50",
                )}
              >
                <button type="button" onClick={() => onSelect({ kind: "block", sectionId, blockId })} className="flex-1 truncate text-left">
                  {blockManifest?.label ?? block.type} · hidden
                </button>
                <Popover trigger={<button type="button" className="rounded p-0.5 hover:bg-accent" aria-label="Block options"><MoreHorizontalIcon size={13} /></button>} align="end">
                  {(close) => (
                    <>
                      <MenuItem icon={<EyeIcon size={14} />} label="Show" onSelect={() => { showBlock(blockId); close(); }} />
                      <MenuItem icon={<TrashIcon size={14} />} label="Delete" destructive onSelect={() => { removeBlock(blockId); close(); }} />
                    </>
                  )}
                </Popover>
              </div>
            );
          })}

          {allowedBlockTypes.length > 0 && (
            <Popover
              trigger={
                <Button size="sm" variant="ghost" className="mt-0.5 w-full justify-start text-muted-foreground">
                  <PlusIcon size={13} />
                  Add block
                </Button>
              }
            >
              {(close) =>
                allowedBlockTypes.map((b) => {
                  const BIcon = iconForType(b.type);
                  return (
                    <MenuItem
                      key={b.type}
                      icon={<BIcon size={14} />}
                      label={b.label}
                      onSelect={() => { addBlock(b.type); close(); }}
                    />
                  );
                })
              }
            </Popover>
          )}
        </div>
      )}
    </div>
  );
}

function BlockRow({
  sectionId,
  blockId,
  block,
  manifest,
  selection,
  dragging,
  canHide,
  onDragStart,
  onDragEnd,
  onDropOn,
  onSelect,
  onDuplicate,
  onHide,
  onRemove,
}: {
  sectionId: string;
  blockId: string;
  block: ThemeBlockInstance;
  manifest: ThemeManifest;
  selection: Selection;
  dragging: boolean;
  canHide: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropOn: () => void;
  onSelect: (s: Selection) => void;
  onDuplicate: () => void;
  onHide: () => void;
  onRemove: () => void;
}) {
  const blockManifest = manifest.blocks.find((b) => b.type === block.type);
  const selected = selection.kind === "block" && selection.sectionId === sectionId && selection.blockId === blockId;
  const Icon = iconForType(block.type);

  return (
    <div
      draggable
      onDragStart={(e) => { e.stopPropagation(); onDragStart(); }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.stopPropagation(); onDropOn(); }}
      className={cn(
        "flex items-center gap-1 rounded px-1 py-1 text-xs transition-opacity",
        selected ? "bg-accent" : "hover:bg-accent/50",
        dragging && "opacity-40",
      )}
    >
      <span className="cursor-grab text-muted-foreground" title="Drag to reorder">
        <DragHandleIcon size={12} />
      </span>
      <button type="button" onClick={() => onSelect({ kind: "block", sectionId, blockId })} className="flex flex-1 items-center gap-1.5 truncate text-left">
        <Icon size={13} className="shrink-0 text-muted-foreground" />
        <span className="truncate">{blockManifest?.label ?? block.type}</span>
      </button>
      <Popover trigger={<button type="button" className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Block options"><MoreHorizontalIcon size={13} /></button>} align="end">
        {(close) => (
          <>
            <MenuItem icon={<DuplicateIcon size={14} />} label="Duplicate" onSelect={() => { onDuplicate(); close(); }} />
            <MenuItem
              icon={<EyeOffIcon size={14} />}
              label="Hide"
              disabled={!canHide}
              title={!canHide ? "At least one block must stay visible" : undefined}
              onSelect={() => { onHide(); close(); }}
            />
            <MenuItem icon={<TrashIcon size={14} />} label="Delete" destructive onSelect={() => { onRemove(); close(); }} />
          </>
        )}
      </Popover>
    </div>
  );
}

// The "+ Add section" flow: a searchable library with an icon + name per section type. The
// manifest has no thumbnail or category field for sections, so this deliberately doesn't
// fabricate screenshots or category groups — icon + label is the real data available.
function AddSectionDialog({
  open,
  onClose,
  sections,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  sections: ThemeSectionManifest[];
  onAdd: (type: string) => void;
}) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  if (!open) return null;
  const filtered = sections.filter((s) => s.label.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[28rem] w-full max-w-md flex-col overflow-hidden rounded-lg border bg-background shadow-popover"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Add section</h2>
            <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:underline">
              Close
            </button>
          </div>
          <Input autoFocus placeholder="Search sections…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">No sections match &quot;{query}&quot;.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {filtered.map((s) => {
                const Icon = iconForType(s.type);
                return (
                  <button
                    key={s.type}
                    type="button"
                    onClick={() => onAdd(s.type)}
                    className="flex flex-col items-start gap-2 rounded-md border p-3 text-left hover:border-primary hover:bg-accent/40"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Icon size={17} />
                    </span>
                    <span className="text-sm font-medium leading-tight">{s.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
