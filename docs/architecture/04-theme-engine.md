# 04 — Theme Engine

One reusable engine, many themes. Themes are data-driven packages of React sections/blocks plus JSON
schemas; merchants edit configuration, never code.

## Vocabulary

| Term     | Meaning                                                         |
| -------- | --------------------------------------------------------------- |
| Theme    | A complete visual system (Foundation, Wholesale Pro, ...)       |
| Template | Page layout inside a theme (`home`, `product`, `collection`, …) |
| Section  | Large configurable component placed in a template               |
| Block    | Nested content component inside a section (max depth 3)         |
| Setting  | A single editable, schema-typed value                           |

Hierarchy: `Page → Template → Section → Block → Setting`.

## Theme package layout

```
themes/wholesale-pro/
├── manifest.json            id, name, version, author, category, screenshot,
│                            capabilities[], platformVersion range
├── templates/               *.json — default section lists per template type
│   ├── home.json  product.json  collection.json  cart.json  search.json
│   ├── product.wholesale.json      (alternate template)
│   └── ...
├── sections/                *.tsx — component + `schema` export
├── blocks/                  *.tsx
├── schema/theme-settings.json      global settings groups (brand, colors, typography, layout, …)
├── locales/en.json tr.json         theme-owned UI strings
└── assets/theme.css                scoped CSS variables and utilities
```

Theme source is authored by platform developers (and later by partners through the Theme SDK/CLI).
Merchant-editable state is exclusively the JSON configuration.

## Configuration format

Stable IDs, explicit order, nothing positional:

```json
{
  "sections": {
    "hero_01": {
      "type": "hero",
      "settings": {
        "heading": "Wholesale made simple",
        "height": { "desktop": "large", "mobile": "medium" }
      },
      "blocks": {
        "button_01": {
          "type": "button",
          "settings": { "label": "Shop now", "url": "/collections/all" }
        }
      },
      "block_order": ["button_01"]
    }
  },
  "order": ["hero_01"]
}
```

Every configuration is validated against the section/block schemas before save and before publish.
Unknown section types, missing required settings, depth > 3, or invalid dynamic-source references
are rejected with field-level errors.

## Setting types

`text, textarea, rich_text, number, range, checkbox, radio, select, color, gradient, image, video,
file, url, product, collection, menu, font, icon, alignment, spacing, date, dynamic_source`.

Any setting may be declared `responsive: true`, in which case its value is
`{ desktop, tablet?, mobile? }` with desktop as the fallback.

## Section registry and renderer

```
Template JSON ─► validate ─► resolve dynamic sources (server) ─► SectionRegistry
              ─► <Section type="hero" settings blocks/> ─► React output
```

- `SectionRegistry` is a static map `type → { Component, schema, presets, availability }` built at
  theme load time. There is no dynamic `import()` of merchant-supplied code and no `eval`.
- Sections receive already-resolved data (`product`, `collection`, `company`, `pricing`) from the
  Storefront API. They never fetch on their own and never compute prices.
- Rich text settings are sanitized to an allow-list of tags on save and on render.

## Global theme settings

Groups: Brand (logo, mobile logo, favicon) · Colors (background, text, primary, secondary, accent,
border, success, warning, error) · Typography (heading/body fonts, scale, letter spacing, line
height) · Layout (page width, container, grid, spacing scale) · Buttons (radius, border, height,
hover) · Product cards (ratio, vendor, price, rating, quick add, secondary image, badges) ·
Animations (none / subtle / standard / enhanced).

Global settings compile to CSS custom properties injected once per page.

## Header, mega menu, footer

Header and footer are ordinary sections with block types (`logo`, `navigation`, `search`,
`account`, `cart`, `language`, `currency`, `cta`). Mega menu entries are blocks of the navigation
block (columns → links / images / promo banners / featured products) — depth stays ≤ 3.

## Dynamic sources

A setting can reference store data instead of a literal:
`{ "$source": "product.title" }`, `{ "$source": "product.metafield.custom.material" }`,
`{ "$source": "company.available_credit" }`. Resolution happens on the server against the current
resource and the _authenticated_ context. B2B fields resolve to `null` for anonymous visitors or
buyers of other companies, so a template can never leak another company's data.

## Draft / published, versions

Editing never mutates the live storefront. See [05-theme-editor.md](./05-theme-editor.md) for the
save/publish flow and [06-database-schema-plan.md](./06-database-schema-plan.md) for
`store_themes`, `store_theme_versions`, `theme_template_versions`.

## Security constraints

- No merchant-supplied JavaScript. No arbitrary HTML outside sanitized rich text.
- Section props are validated; unexpected keys are dropped.
- Preview URLs are signed (store, theme, version, expiry) and served with `no-store`.
- App blocks (Phase 15) render inside the registry like first-party blocks but only receive data
  permitted by the app's scopes.

## Initial themes

Phase 9 ships **Foundation** (general purpose) and **Wholesale Pro** (B2B). The remaining eight
(Industrial, Supply, Build, Techline, Atelier, Essentials, Market, Prestige) are added only after
the engine and editor are stable with those two.
