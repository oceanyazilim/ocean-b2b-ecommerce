# 13 — Phases and Testing Strategy

This is the living roadmap. Update the status column as modules land.

## Method (per module)

Before implementing: state the goal, dependencies, data model, API, service layer, UI screens,
validation, permissions, and tests. After implementing: typecheck, lint, tests, migrations, tenant
isolation, responsive UI, error/loading/empty states, security review.

## Phases

| Phase | Scope                                                                                                                                                           | Status                                                                                                                                                                                                                                                                     |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Monorepo, architecture docs, standards, CI, DB bootstrap, design system bootstrap, auth scaffolding                                                             | **done**                                                                                                                                                                                                                                                                   |
| 1     | SaaS core: users, auth (sessions, verification, reset), organizations, stores, memberships, invitations, RBAC guards, audit log, onboarding checklist, admin UI | **done** — migration applied, seed, 24/24 integration tests (isolation, permissions, rate limit), browser journey verified                                                                                                                                                 |
| 1b    | TOTP MFA + recovery codes, session list/revoke UI, login events, new-ip/new-device flags + notification email                                                   | **done** — 35/35 integration tests, browser: enrol → challenge on login → recovery codes                                                                                                                                                                                   |
| 2     | Product catalog: products, options, variants, media, collections (manual + automated), metafields, tags, SEO                                                    | **done** — 56 unit + integration tests, browser: product with options → variants, media upload, automated collection                                                                                                                                                       |
| 3     | Inventory: locations, items, levels, movements ledger, transfers                                                                                                | **done** — 10/10 integration + 3 unit tests (levels, adjustments, damage bucket, transfers, approvals, isolation, RBAC); admin Stock/Transfers/Movements/Locations screens                                                                                                 |
| 4     | Customers & B2B: customers, companies, locations, company users, applications                                                                                   | **done** — 16 integration + 4 unit tests (addresses, optimistic locking, company locations/users, application approval, isolation, RBAC); admin Customers, Companies (overview/locations/users), Applications screens                                                      |
| 5     | Catalog access & pricing: catalogs, price lists, volume pricing, quantity rules, contract prices, pricing service                                               | **done** — 8 integration + 4 unit tests (catalog visibility, list priority, tiers, quantity rules, contract windows, isolation, RBAC); admin Catalogs, Pricing (lists/volume/quantity/contracts/simulator), company Pricing tab                                            |
| 6     | Commerce: carts, checkout engine, orders, draft orders                                                                                                          | **done** — 5 integration tests (priced carts, idempotent checkout, reservations, cancel/restock, draft → order, isolation, RBAC); admin Orders list/detail, Draft orders editor, live dashboard metrics. Shipping/tax are zero-calculators behind interfaces until Phase 7 |
| 7     | Payments & shipping: PSP adapter interface + first adapter, shipping zones/rates, fulfillments, returns, taxes                                                  | **backend done** — 7 integration tests (rate selection/eligibility, tax inclusive/exclusive, manual + test PSP adapters, confirm/void, partial fulfilment + inventory movements, cancel-with-restock re-reserves, return → receive → refund, isolation/RBAC); admin UI not yet built |
| 8     | Storefront runtime: Storefront API, product/collection/search/cart pages, markets, content, domains                                                             |                                                                                                                                                                                                                                                                            |
| 9     | Theme engine: manifest, templates, sections, blocks, settings, renderer; Foundation + Wholesale Pro                                                             |                                                                                                                                                                                                                                                                            |
| 10    | Theme editor: preview bridge, tree, settings panel, DnD, responsive, autosave, draft/publish                                                                    |                                                                                                                                                                                                                                                                            |
| 11    | Theme versioning: history, undo/redo, preview links, rollback, scheduled publish                                                                                |                                                                                                                                                                                                                                                                            |
| 12    | B2B advanced: quotes, credit, payment terms, approvals, quick order, saved lists, finance/AR, discounts                                                         |                                                                                                                                                                                                                                                                            |
| 13    | Analytics: event pipeline, dashboards, B2B reports, notifications                                                                                               |                                                                                                                                                                                                                                                                            |
| 14    | SaaS billing: plans, entitlements, subscriptions, feature flags                                                                                                 |                                                                                                                                                                                                                                                                            |
| 15    | Developers: public API, webhooks, OAuth, apps, app blocks                                                                                                       |                                                                                                                                                                                                                                                                            |
| 16    | Enterprise: SSO, custom roles, expanded audit, large-catalog performance, support tooling                                                                       |                                                                                                                                                                                                                                                                            |

## MVP boundary (spec §120)

Phases 0–11 plus the payment-adapter and basic-analytics slices of 7 and 13, and the subscription
foundation slice of 14.

## Testing strategy

| Level         | Tooling                                                                                                | Scope                                                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit          | Vitest                                                                                                 | Pure logic: permission engine, pricing precedence, quantity rules, state machines, theme schema validation                                                     |
| Integration   | Vitest + Postgres (CI svc)                                                                             | Services + repositories against a real DB; every module ships tenant-isolation tests that attempt access with a foreign `TenantContext` and expect `not_found` |
| API           | Vitest + supertest                                                                                     | Contract tests per endpoint: auth matrix (role × endpoint), validation errors, idempotency replay, pagination                                                  |
| E2E           | Playwright                                                                                             | Critical journeys below, run against a preview deployment                                                                                                      |
| Security      | ESLint security rules, `pnpm audit`, authz matrix, isolation suite, rate-limit tests, periodic pentest |                                                                                                                                                                |
| Performance   | k6 (checkout, storefront TTFB, large catalog listing)                                                  | from Phase 8                                                                                                                                                   |
| Accessibility | axe in Playwright for storefront templates and admin screens                                           | from Phase 3                                                                                                                                                   |

### Critical E2E journeys

Sign up → verify → create organization → create store · Create product with variants · Configure
company + location + buyer · Create catalog and assign · Configure price list + volume pricing ·
Add to cart with quantity rules · Checkout (payment) · Checkout (payment terms + credit) · Order →
fulfil → refund · Quote request → send → accept → order · Customize theme → preview → publish →
rollback · Connect custom domain (mocked DNS).

### Definition of done for a module

- Typecheck, lint, unit + integration + API tests green in CI.
- Migrations applied on a fresh DB and on a DB at the previous version.
- Tenant-isolation tests present and passing.
- Permissions declared on every endpoint; UI gated with the same vocabulary.
- Empty, loading, and error states implemented for every new screen; responsive at 390 px.
- Audit events emitted for sensitive actions; domain events emitted for state changes.
- Docs in this folder updated if the design changed.
