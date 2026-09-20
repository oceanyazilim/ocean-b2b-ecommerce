"use client";

import type { SettingField } from "@ocean/types";
import { Checkbox, ImageIcon, Input, Select, Textarea } from "@ocean/ui";

// Renders one input for one manifest-declared setting field, typed by its declared `type`.
// Shared by the theme's global-settings form and the visual editor's section/block panels.
export function ThemeSettingInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: SettingField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled: boolean;
}) {
  const current = value ?? field.default ?? "";
  switch (field.type) {
    case "boolean":
      return <Checkbox checked={Boolean(current)} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />;
    case "number":
      return (
        <Input
          type="number"
          value={typeof current === "number" ? current : ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          disabled={disabled}
        />
      );
    case "richtext":
      return <Textarea value={String(current)} onChange={(e) => onChange(e.target.value)} rows={4} disabled={disabled} />;
    case "color": {
      const hex = String(current || "#000000");
      return (
        <div className="flex items-center gap-2">
          <span
            className="h-8 w-8 shrink-0 overflow-hidden rounded-md border"
            style={{ backgroundColor: /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex) ? hex : "transparent" }}
          >
            <input
              type="color"
              value={/^#([0-9a-f]{6})$/i.test(hex) ? hex : "#000000"}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled}
              className="h-full w-full cursor-pointer opacity-0"
              aria-label={`${field.label} color picker`}
            />
          </span>
          <Input
            value={hex}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder="#000000"
            className="font-mono text-xs uppercase"
          />
        </div>
      );
    }
    case "select": {
      // Fields whose key/label reads as a typeface picker get a live preview rendered in the
      // selected value — a genuine typography preview, driven only by the manifest's own
      // options, not a fabricated font-picker widget.
      const looksLikeFont = /font|typeface|typography/i.test(`${field.key} ${field.label}`);
      return (
        <div className="flex flex-col gap-1.5">
          <Select value={String(current)} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
            {(field.options ?? []).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
          {looksLikeFont && current && (
            <p className="truncate rounded-md border bg-muted/40 px-2.5 py-1.5 text-sm" style={{ fontFamily: String(current) }}>
              The quick brown fox jumps
            </p>
          )}
        </div>
      );
    }
    case "image": {
      const url = String(current);
      return (
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-muted-foreground">
            {/^https?:\/\//.test(url) ? (
              // eslint-disable-next-line @next/next/no-img-element -- arbitrary merchant-supplied URL, not a local/optimizable asset
              <img src={url} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImageIcon size={16} />
            )}
          </span>
          <Input value={url} onChange={(e) => onChange(e.target.value)} placeholder="https://…/image.jpg" disabled={disabled} />
        </div>
      );
    }
    case "url":
    case "text":
    default:
      return <Input value={String(current)} onChange={(e) => onChange(e.target.value)} disabled={disabled} />;
  }
}
