"use client";

import type { TemplateConfiguration, ThemeManifest } from "@ocean/types";
import { FormField } from "@ocean/ui";

import { ThemeSettingInput } from "@/components/theme-setting-input";

import type { Selection } from "./types";

// Right-hand panel: settings for whatever's selected in the tree (a section, a block, or —
// when nothing is — the theme's own global settings).
export function ThemeEditorPanel({
  manifest,
  config,
  selection,
  globalSettings,
  onChangeGlobalSettings,
  onChangeConfig,
}: {
  manifest: ThemeManifest;
  config: TemplateConfiguration;
  selection: Selection;
  globalSettings: Record<string, unknown>;
  onChangeGlobalSettings: (next: Record<string, unknown>) => void;
  onChangeConfig: (next: TemplateConfiguration) => void;
}) {
  if (selection.kind === "global") {
    return (
      <div className="flex flex-col gap-4 p-4">
        <h2 className="text-sm font-semibold">Theme settings</h2>
        {manifest.globalSettings.length === 0 ? (
          <p className="text-sm text-muted-foreground">This theme has no global settings.</p>
        ) : (
          manifest.globalSettings.map((field) => (
            <FormField key={field.key} id={`global-${field.key}`} label={field.label}>
              <ThemeSettingInput
                field={field}
                value={globalSettings[field.key]}
                onChange={(value) => onChangeGlobalSettings({ ...globalSettings, [field.key]: value })}
                disabled={false}
              />
            </FormField>
          ))
        )}
      </div>
    );
  }

  const section = config.sections[selection.sectionId];
  if (!section) return null;

  if (selection.kind === "section") {
    const sectionManifest = manifest.sections.find((s) => s.type === section.type);
    return (
      <div className="flex flex-col gap-4 p-4">
        <h2 className="text-sm font-semibold">{sectionManifest?.label ?? section.type}</h2>
        {(sectionManifest?.settings.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">This section has no settings.</p>
        ) : (
          sectionManifest?.settings.map((field) => (
            <FormField key={field.key} id={`section-${field.key}`} label={field.label}>
              <ThemeSettingInput
                field={field}
                value={section.settings[field.key]}
                onChange={(value) =>
                  onChangeConfig({
                    ...config,
                    sections: {
                      ...config.sections,
                      [selection.sectionId]: { ...section, settings: { ...section.settings, [field.key]: value } },
                    },
                  })
                }
                disabled={false}
              />
            </FormField>
          ))
        )}
      </div>
    );
  }

  const block = section.blocks[selection.blockId];
  if (!block) return null;
  const blockManifest = manifest.blocks.find((b) => b.type === block.type);
  return (
    <div className="flex flex-col gap-4 p-4">
      <h2 className="text-sm font-semibold">{blockManifest?.label ?? block.type}</h2>
      {(blockManifest?.settings.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">This block has no settings.</p>
      ) : (
        blockManifest?.settings.map((field) => (
          <FormField key={field.key} id={`block-${field.key}`} label={field.label}>
            <ThemeSettingInput
              field={field}
              value={block.settings[field.key]}
              onChange={(value) =>
                onChangeConfig({
                  ...config,
                  sections: {
                    ...config.sections,
                    [selection.sectionId]: {
                      ...section,
                      blocks: {
                        ...section.blocks,
                        [selection.blockId]: { ...block, settings: { ...block.settings, [field.key]: value } },
                      },
                    },
                  },
                })
              }
              disabled={false}
            />
          </FormField>
        ))
      )}
    </div>
  );
}
