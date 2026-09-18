"use client";

import type { TemplateConfiguration, ThemeBlockManifest, ThemeManifest, ThemeSectionInstance } from "@ocean/types";
import { Button, cn, Select } from "@ocean/ui";
import { useState } from "react";

import type { Selection } from "./types";

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
  const allowedSectionTypes =
    template && template.sections.length > 0
      ? manifest.sections.filter((s) => template.sections.includes(s.type))
      : manifest.sections;

  const sectionDrag = useDragReorder(config.sectionOrder, (sectionOrder) => onChange({ ...config, sectionOrder }));

  function addSection(type: string) {
    const sectionManifest = manifest.sections.find((s) => s.type === type);
    if (!sectionManifest) return;
    const id = `s_${Math.random().toString(36).slice(2, 9)}`;
    const settings = Object.fromEntries(sectionManifest.settings.map((f) => [f.key, f.default ?? null]));
    onChange({
      sections: { ...config.sections, [id]: { type, settings, blocks: {}, blockOrder: [] } },
      sectionOrder: [...config.sectionOrder, id],
    });
    setAddingSection(false);
    onSelect({ kind: "section", sectionId: id });
  }

  function removeSection(id: string) {
    const { [id]: _removed, ...rest } = config.sections;
    onChange({ sections: rest, sectionOrder: config.sectionOrder.filter((s) => s !== id) });
    if (selection.kind !== "global" && selection.sectionId === id) onSelect({ kind: "global" });
  }

  function updateSection(sectionId: string, section: ThemeSectionInstance) {
    onChange({ ...config, sections: { ...config.sections, [sectionId]: section } });
  }

  function removeBlock(sectionId: string, blockId: string, section: ThemeSectionInstance) {
    const { [blockId]: _removed, ...rest } = section.blocks;
    updateSection(sectionId, { ...section, blocks: rest, blockOrder: section.blockOrder.filter((b) => b !== blockId) });
    if (selection.kind === "block" && selection.sectionId === sectionId && selection.blockId === blockId) {
      onSelect({ kind: "global" });
    }
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      <button
        type="button"
        onClick={() => onSelect({ kind: "global" })}
        className={cn(
          "rounded-md px-2 py-1.5 text-left text-sm font-medium",
          selection.kind === "global" ? "bg-accent" : "hover:bg-accent/50",
        )}
      >
        Theme settings
      </button>
      <div className="mt-2 flex items-center justify-between px-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sections</span>
        <Button size="sm" variant="ghost" onClick={() => setAddingSection((v) => !v)}>
          + Add
        </Button>
      </div>
      {addingSection && (
        <div className="px-2 pb-1">
          <Select onChange={(e) => e.target.value && addSection(e.target.value)} defaultValue="">
            <option value="" disabled>
              Choose a section type
            </option>
            {allowedSectionTypes.map((s) => (
              <option key={s.type} value={s.type}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
      )}
      {config.sectionOrder.length === 0 && (
        <p className="px-2 py-2 text-sm text-muted-foreground">No sections yet.</p>
      )}
      {config.sectionOrder.map((sectionId) => {
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
            onDragStart={() => sectionDrag.onDragStart(sectionId)}
            onDragEnd={sectionDrag.onDragEnd}
            onDropOn={() => sectionDrag.onDropOn(sectionId)}
            onSelect={onSelect}
            onRemove={() => removeSection(sectionId)}
            onUpdateSection={(next) => updateSection(sectionId, next)}
            onRemoveBlock={(blockId) => removeBlock(sectionId, blockId, section)}
          />
        );
      })}
    </div>
  );
}

function SectionRow({
  sectionId,
  section,
  manifest,
  selection,
  dragging,
  onDragStart,
  onDragEnd,
  onDropOn,
  onSelect,
  onRemove,
  onUpdateSection,
  onRemoveBlock,
}: {
  sectionId: string;
  section: ThemeSectionInstance;
  manifest: ThemeManifest;
  selection: Selection;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropOn: () => void;
  onSelect: (s: Selection) => void;
  onRemove: () => void;
  onUpdateSection: (next: ThemeSectionInstance) => void;
  onRemoveBlock: (blockId: string) => void;
}) {
  const sectionManifest = manifest.sections.find((s) => s.type === section.type);
  const selected = selection.kind === "section" && selection.sectionId === sectionId;
  const blockDrag = useDragReorder(section.blockOrder, (blockOrder) => onUpdateSection({ ...section, blockOrder }));
  const allowedBlockTypes: ThemeBlockManifest[] = manifest.blocks.filter((b) => sectionManifest?.blocks.includes(b.type));

  function addBlock(type: string) {
    const blockManifest = manifest.blocks.find((b) => b.type === type);
    if (!blockManifest) return;
    const id = `b_${Math.random().toString(36).slice(2, 9)}`;
    const settings = Object.fromEntries(blockManifest.settings.map((f) => [f.key, f.default ?? null]));
    onUpdateSection({
      ...section,
      blocks: { ...section.blocks, [id]: { type, settings } },
      blockOrder: [...section.blockOrder, id],
    });
    onSelect({ kind: "block", sectionId, blockId: id });
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropOn}
      className={cn("rounded-md border", dragging && "opacity-50")}
    >
      <div className={cn("flex items-center justify-between gap-1 rounded-t-md px-2 py-1.5", selected ? "bg-accent" : "hover:bg-accent/50")}>
        <button
          type="button"
          onClick={() => onSelect({ kind: "section", sectionId })}
          className="flex-1 cursor-grab truncate text-left text-sm"
          title="Drag to reorder"
        >
          ⠿ {sectionManifest?.label ?? section.type}
        </button>
        <button type="button" onClick={onRemove} className="text-xs text-muted-foreground hover:text-destructive">
          ✕
        </button>
      </div>
      {allowedBlockTypes.length > 0 && (
        <div className="flex flex-col gap-0.5 border-t px-2 py-1">
          {section.blockOrder.map((blockId) => {
            const block = section.blocks[blockId];
            if (!block) return null;
            const blockManifest = manifest.blocks.find((b) => b.type === block.type);
            const blockSelected = selection.kind === "block" && selection.sectionId === sectionId && selection.blockId === blockId;
            return (
              <div
                key={blockId}
                draggable
                onDragStart={(e) => {
                  e.stopPropagation();
                  blockDrag.onDragStart(blockId);
                }}
                onDragEnd={blockDrag.onDragEnd}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.stopPropagation();
                  blockDrag.onDropOn(blockId);
                }}
                className={cn(
                  "flex items-center justify-between gap-1 rounded px-2 py-1 text-xs",
                  blockSelected ? "bg-accent" : "hover:bg-accent/50",
                  blockDrag.draggingId === blockId && "opacity-50",
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect({ kind: "block", sectionId, blockId })}
                  className="flex-1 cursor-grab truncate text-left"
                >
                  ⠿ {blockManifest?.label ?? block.type}
                </button>
                <button type="button" onClick={() => onRemoveBlock(blockId)} className="text-muted-foreground hover:text-destructive">
                  ✕
                </button>
              </div>
            );
          })}
          <Select className="mt-1 h-7 text-xs" onChange={(e) => e.target.value && addBlock(e.target.value)} defaultValue="">
            <option value="" disabled>
              + Add block
            </option>
            {allowedBlockTypes.map((b) => (
              <option key={b.type} value={b.type}>
                {b.label}
              </option>
            ))}
          </Select>
        </div>
      )}
    </div>
  );
}
