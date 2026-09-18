"use client";

import type { SettingField } from "@ocean/types";
import { Checkbox, Input, Select, Textarea } from "@ocean/ui";

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
    case "color":
      return (
        <Input
          type="color"
          value={String(current || "#000000")}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      );
    case "select":
      return (
        <Select value={String(current)} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
          {(field.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      );
    case "image":
    case "url":
    case "text":
    default:
      return (
        <Input
          value={String(current)}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.type === "image" ? "https://…/image.jpg" : undefined}
          disabled={disabled}
        />
      );
  }
}
