# 03 — Frontend Applications

All four apps are Next.js 15 (App Router, React 19, TypeScript, Tailwind). They share `@ocean/ui`,
`@ocean/types`, `@ocean/permissions`, `@ocean/utils`, and call the API exclusively over HTTP.
No frontend has database access.

## `apps/marketing` — public SaaS website

Static/ISR marketing pages: `/`, `/features`, `/b2b`, `/wholesale`, `/themes`, `/pricing`,
`/enterprise`, `/developers`, `/resources`, `/blog`, `/help`, `/status`, `/legal/*`, plus
`/login` and `/signup` entry points that hand off to the admin app. Content-driven, SEO-first.

## `apps/admin` — merchant admin

```
app/
├── (auth)/            login, signup, verify-email, reset-password, mfa
├── (onboarding)/      create-organization, create-store, checklist
└── (dashboard)/[storeSlug]/
    ├── page.tsx              Home (metrics, operational cards, date range)
    ├── orders/  products/  inventory/  customers/  companies/  catalogs/
    ├── pricing/ quotes/    finance/    discounts/  content/    storefront/
    ├── markets/ analytics/ marketing/  apps/       settings/
    └── layout.tsx            sidebar nav + command palette (⌘K) + store switcher
```

Principles:

- Store context is in the URL (`/[storeSlug]/...`); the organization is derived from the store.
- Navigation items and action buttons are gated with `@ocean/permissions` (`satisfies(set, req)`)
  using the permission set the API returns for the current membership. This is UX only; the API
  enforces the real check.
- Tables use one shared `DataGrid` (search, filters, sort, column visibility, bulk actions, saved
  views, cursor pagination, selection). Orders/Products/Customers/Companies/Inventory are all
  instances of it.
- Every list page ships an empty state with a primary CTA and a secondary import action.
- Skeletons, not spinners. Layout stays stable while loading.
- Destructive actions open a confirmation dialog that names the resource.
- Works on tablet and phone widths: sidebar collapses to a drawer, tables switch to card rows.

## `apps/storefront` — merchant storefront + B2B portal

Multi-tenant by host header. Middleware resolves `{store}.platform.com` or a verified custom
domain to a store id and injects it into the request. Routes follow spec §42:

```
/                               /collections/[handle]      /products/[handle]
/search                         /cart                      /checkout
/pages/[handle]                 /blogs/[blog]/[article]    /contact
/account                        /account/orders/[id]       /account/invoices
/account/quotes                 /account/company           /account/team
/account/addresses              /quick-order
```

The page shell is produced by the Theme Engine ([04-theme-engine.md](./04-theme-engine.md)); the
storefront app hosts the runtime, calls the Storefront API, and never computes prices, taxes,
availability or credit itself. Preview mode (signed token) renders a draft theme version instead of
the published one and disables caching.

Caching policy: anonymous pages are edge-cacheable per store + market + locale; any request with a
customer or company session is `private, no-store`.

## `apps/platform-admin` — internal operators

Separate deployment, separate auth realm (platform staff accounts, SSO later), network-restricted.
Screens: organizations, stores, users, plans/subscriptions, billing state, themes catalog, apps,
domains, webhooks failures, jobs, audit logs, feature flags, incidents, impersonation (audited,
time-boxed, visibly bannered).

## Design system (`@ocean/ui`)

One component set, themed via CSS variables (`@ocean/ui/styles.css`) so each app can carry its own
palette while behaving identically. Planned component inventory (spec §115): Button, Input, Select,
Combobox, Modal, Drawer, Popover, Tooltip, Table/DataGrid, Badge, Card, Tabs, Pagination, Command
Menu, Toast, EmptyState, Skeleton, DatePicker, FilePicker, ColorPicker. Accessible by default:
semantic elements, keyboard operability, visible focus, labelled controls.

Phase 0 ships `Button` and `cn()` as the proof of wiring; the rest arrive with the screens that need
them.

## Data fetching

- Server Components fetch from the API with the user's session cookie forwarded; mutations go
  through Server Actions or route handlers that call the API — never directly to Prisma.
- Client-side interactivity uses a thin typed client (`packages/sdk`, Phase 8) generated from the
  zod contracts in `@ocean/types`.
- Optimistic UI is allowed only where the API is idempotent and the rollback is trivial.

## Internationalization

Platform UI strings (admin, platform-admin, marketing) use message catalogs keyed by locale with
fallback to `en`. Store content translations (product titles, pages, theme text) are data, stored
per locale in the database, and served by the Storefront API. The two systems are independent.
Layout primitives use logical CSS properties so RTL can be enabled later without rework.
