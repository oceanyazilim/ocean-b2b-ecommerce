"use client";

import type { SettingField, TemplateConfiguration, ThemeManifest } from "@ocean/types";
import { FormField, PaletteIcon } from "@ocean/ui";
import { useMemo } from "react";

import { ThemeSettingInput } from "@/components/theme-setting-input";

import type { Selection } from "./types";

// Groups the manifest's flat globalSettings array into labeled clusters purely by each field's
// `key`/`type` — the manifest itself doesn't declare groups, so this is presentation only, not
// new data. Anything that doesn't match a known bucket lands in "General".
function groupGlobalSettings(fields: SettingField[]): { title: string; fields: SettingField[] }[] {
  const buckets: Record<string, SettingField[]> = { Branding: [], Colors: [], Typography: [], General: [] };
  for (const field of fields) {
    const probe = `${field.key} ${field.label}`.toLowerCase();
    if (field.type === "color" || /color/.test(probe)) buckets.Colors!.push(field);
    else if (/logo|favicon|icon/.test(probe)) buckets.Branding!.push(field);
    else if (/font|typograph/.test(probe)) buckets.Typography!.push(field);
    else buckets.General!.push(field);
  }
  return Object.entries(buckets)
    .filter(([, list]) => list.length > 0)
    .map(([title, list]) => ({ title, fields: list }));
}

function SettingsGroup({
  title,
  fields,
  values,
  disabled,
  idPrefix,
  onChange,
}: {
  title: string;
  fields: SettingField[];
  values: Record<string, unknown>;
  disabled: boolean;
  idPrefix: string;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="flex flex-col gap-3">
        {fields.map((field) => (
          <FormField key={field.key} id={`${idPrefix}-${field.key}`} label={field.label}>
            <ThemeSettingInput
              field={field}
              value={values[field.key]}
              onChange={(value) => onChange(field.key, value)}
              disabled={disabled}
            />
          </FormField>
        ))}
      </div>
    </div>
  );
}

// Right-hand panel: settings for whatever's selected in the tree (a section, a block, or —
// when nothing is — the theme's own global design tokens, presented as grouped
// colors/typography/branding rather than one flat form).
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
  const groupedGlobal = useMemo(() => groupGlobalSettings(manifest.globalSettings), [manifest.globalSettings]);

  if (selection.kind === "global") {
    return (
      <div className="flex flex-col gap-5 p-4">
        <div className="flex items-center gap-2">
          <PaletteIcon size={16} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold">Theme settings</h2>
        </div>
        {manifest.globalSettings.length === 0 ? (
          <p className="text-sm text-muted-foreground">This theme has no global settings.</p>
        ) : (
          groupedGlobal.map((group) => (
            <SettingsGroup
              key={group.title}
              title={group.title}
              fields={group.fields}
              values={globalSettings}
              disabled={false}
              idPrefix="global"
              onChange={(key, value) => onChangeGlobalSettings({ ...globalSettings, [key]: value })}
            />
          ))
        )}
      </div>
    );
  }

  const section = config.sections[selection.sectionId];
  if (!section) return null;

  if (selection.kind === "section") {
    const sectionManifest = manifest.sections.find((s) => s.type === section.type);
    const hidden = !config.sectionOrder.includes(selection.sectionId);
    return (
      <div className="flex flex-col gap-4 p-4">
        <div>
          <h2 className="text-sm font-semibold">{sectionManifest?.label ?? section.type}</h2>
          {hidden && <p className="mt-0.5 text-xs text-warning-foreground">Hidden — won&apos;t show on the storefront.</p>}
        </div>
        {(sectionManifest?.settings.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">This section has no settings.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {sectionManifest?.settings.map((field) => (
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
            ))}
          </div>
        )}
      </div>
    );
  }

  const block = section.blocks[selection.blockId];
  if (!block) return null;
  const blockManifest = manifest.blocks.find((b) => b.type === block.type);
  const blockHidden = !section.blockOrder.includes(selection.blockId);
  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-sm font-semibold">{blockManifest?.label ?? block.type}</h2>
        {blockHidden && <p className="mt-0.5 text-xs text-warning-foreground">Hidden — won&apos;t show on the storefront.</p>}
      </div>
      {(blockManifest?.settings.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">This block has no settings.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {blockManifest?.settings.map((field) => (
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
          ))}
        </div>
      )}
    </div>
  );
}
