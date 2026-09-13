# 05 — Theme Editor

Visual editor inside the merchant admin (`/[storeSlug]/storefront/themes/[id]/editor`).

## Layout

```
┌ Top bar: Exit · Page ▾ · Market ▾ · Language ▾ · ↶ ↷ · Desktop/Tablet/Mobile · Saving… · Publish ┐
├───────────────┬──────────────────────────────────────────────┬──────────────────────────────────┤
│ Left: page    │ Center: live storefront preview (iframe)     │ Right: selected element settings │
│ structure     │ hover → highlight, click → select            │ schema-driven form               │
│ tree (DnD)    │                                              │                                  │
└───────────────┴──────────────────────────────────────────────┴──────────────────────────────────┘
```

## State model

The editor holds one `EditorDocument`:

```
{
  themeVersionId, templateType, templateName,
  globalSettings, template: { sections, order },
  selection: { sectionId?, blockId? },
  viewport: "desktop" | "tablet" | "mobile",
  history: { undo: Command[], redo: Command[] },
  save: { status: "idle" | "saving" | "saved" | "failed", lastSavedAt, error? }
}
```

All mutations are **commands** with `apply()` / `invert()`:
`CHANGE_SETTING, ADD_SECTION, REMOVE_SECTION, MOVE_SECTION, DUPLICATE_SECTION, TOGGLE_SECTION,
ADD_BLOCK, MOVE_BLOCK, REMOVE_BLOCK, DUPLICATE_BLOCK, CHANGE_GLOBAL_SETTING`. Undo/redo are stacks
of commands; the reducer never mutates in place. Commands are also the unit of autosave.

## Preview bridge

```
Editor (admin origin)  ──postMessage──►  Preview iframe (storefront origin, /preview?token=…)
      ◄──postMessage──  hover/select/section-rects/ready/errors
```

- Messages are typed (`@ocean/theme-editor` shared protocol), version-tagged, and origin-checked
  on both sides.
- On a setting change the editor sends a **patch** (`{ sectionId, path, value }`); the runtime
  re-renders that section only. Structural changes (add/move/remove) send the affected subtree.
  Full reload is a fallback, not the norm.
- The preview marks each rendered section with `data-section-id` and reports bounding rects for the
  canvas overlay (hover outline, selection frame, inline Edit/Move/Hide/Duplicate toolbar).
- Preview requests carry a signed token (store, theme version, expiry, optional password); the
  runtime uses draft config and disables all shared caching.

## Autosave

Local state updates synchronously. A debounced (≈800 ms) autosave sends the command batch since the
last save with the current `version_etag`. Server responses: `saved` (new etag) · `conflict` (another
session saved first → show diff prompt, never silently overwrite) · `failed` (offline → retry with
backoff, keep editing). Status is always visible in the top bar.

## Draft → publish

```
edit ─► autosave draft version ─► validate (schemas, dynamic sources, required assets)
     ─► Publish now | Schedule ─► create immutable published snapshot
     ─► store_themes.published_version_id = snapshot ─► invalidate storefront cache
```

Publishing requires `themes.publish`; editing requires `themes.edit`. The published snapshot is
never modified; rollback creates a new draft from an old snapshot and publishes it, preserving
history.

## Version history

List of `store_theme_versions` (number, author, created/published at, note). Actions: preview,
restore as draft, republish. Compare arrives later. History is retained per entitlement
(`theme_versions` limit) with the currently published version always exempt from pruning.

## Responsive editing

Viewport switcher resizes the iframe (1280 / 834 / 390 px). Settings declared `responsive` show a
per-viewport toggle; editing at tablet or mobile writes only that breakpoint's key.

## Drag and drop

Sidebar tree and canvas both support reordering sections and blocks. Drops produce `MOVE_*`
commands; IDs never change. Nesting beyond depth 3 is refused with an explanatory tooltip.

## Multi-session safety

`store_theme_versions.etag` (or `updated_at` version) is sent on every save. Two staff editing the
same draft get a conflict prompt on the second save instead of a silent overwrite.

## Theme library & preview links

`/storefront/themes` lists the current theme and installed themes with Customize / Preview /
Duplicate / Rename / Publish / Remove. New themes are installed as private drafts. Shareable preview
links are signed URLs with expiry and optional password — never a guessable `?preview=1`.
