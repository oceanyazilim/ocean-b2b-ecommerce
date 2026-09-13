# 00 — Architecture Overview

Ocean Commerce is a multi-tenant commerce **platform**, not a single store. Thousands of independent
organizations create, configure, theme, and operate their own storefronts on one shared codebase.

## Product surfaces

| Surface             | App                            | Audience                 | Host (prod)                    |
| ------------------- | ------------------------------ | ------------------------ | ------------------------------ |
| Marketing website   | `apps/marketing`               | Prospects, docs readers  | `platform.com`                 |
| Merchant admin      | `apps/admin`                   | Merchant staff           | `admin.platform.com`           |
| Storefront          | `apps/storefront`              | Shoppers, B2B buyers     | `{store}.platform.com`, custom |
| B2B customer portal | `apps/storefront` `/account/*` | Company buyers/approvers | same as storefront             |
| Platform admin      | `apps/platform-admin`          | Platform operators only  | internal network / SSO         |
| API                 | `apps/api`                     | All of the above         | `api.platform.com`             |

The B2B portal is a set of authenticated routes inside the storefront app (the spec's storefront
route list already includes `/account/company`, `/account/team`, `/account/quotes`). Splitting it out
would duplicate theme rendering and session handling for no benefit.

Platform super-admin functionality is **never** mounted inside the merchant admin app. It is a separate
deployable with its own auth realm.

## Tenancy hierarchy

```
Platform
└── Organization            (billing + ownership boundary; e.g. "ABC Holding")
    ├── Organization members
    └── Store[]             (operational boundary; e.g. "ABC Wholesale", "ABC Germany")
        ├── Store members (roles)
        └── Store data      (products, orders, companies, themes, domains, ...)
```

`Organization ≠ Store`. A subscription belongs to an organization; entitlements (`stores.max`,
`staff.max`, ...) are evaluated at the organization level; operational data is scoped by store.
Details in [08-multi-tenant-model.md](./08-multi-tenant-model.md).

## Boundary principle (non-negotiable)

| Layer         | Owns                                                                   | Must never                                                   |
| ------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| Commerce Core | Truth: validation, pricing, inventory, orders, payments, authorization | Trust client-supplied prices, totals, discounts, permissions |
| Theme Engine  | Presentation: templates, sections, blocks, settings, rendering         | Compute prices/tax/availability; execute merchant code       |
| Admin         | Operations UI                                                          | Contain business rules; hard-code permission checks          |
| Apps          | Extensions through scoped APIs, webhooks, and app blocks               | Edit theme source; receive unscoped data                     |
| Analytics     | Reporting from the event stream                                        | Become the source of truth for any transactional value       |

Every request that changes money, stock, or access flows through the API, is authorized by the
permission engine, and is recomputed server-side.

## Architectural style

A **modular monolith** (`apps/api`, NestJS). Each domain is a Nest module with an explicit public
surface (exported services) and private internals. Cross-module calls go through those services, or
through domain events for anything asynchronous. This keeps a future extraction of Search, Pricing,
Checkout, Payments, or Analytics into standalone services a mechanical change rather than a rewrite.

Module map: [02-backend-modules.md](./02-backend-modules.md).

## Request path

```
Browser ─► Next.js app (SSR / RSC) ─► @ocean/api (REST, versioned)
                                         ├─ Tenant context resolver
                                         ├─ Auth guard (session)
                                         ├─ Permission guard (@ocean/permissions)
                                         ├─ Domain service (validation + business rules)
                                         ├─ Prisma (@ocean/db) ─► PostgreSQL
                                         ├─ Redis (sessions, cache, idempotency keys)
                                         └─ BullMQ (jobs) ─► workers ─► webhooks / email / search / images
```

Storefront pages are cacheable at the edge **only** when the response is not personalized. Any
response influenced by a company, catalog, price list, or logged-in customer bypasses shared caches.
See [10-events-queues-caching.md](./10-events-queues-caching.md).

## Document index

| #   | Document                                                             | Spec sections    |
| --- | -------------------------------------------------------------------- | ---------------- |
| 01  | [Monorepo structure](./01-monorepo-structure.md)                     | §100, §114       |
| 02  | [Backend modules](./02-backend-modules.md)                           | §101             |
| 03  | [Frontend applications](./03-frontend-apps.md)                       | §2, §115–§119    |
| 04  | [Theme engine](./04-theme-engine.md)                                 | §43–§56, §71–§76 |
| 05  | [Theme editor](./05-theme-editor.md)                                 | §57–§70          |
| 06  | [Database schema plan](./06-database-schema-plan.md)                 | §102–§104        |
| 07  | [Authentication and RBAC](./07-auth-and-rbac.md)                     | §5–§6            |
| 08  | [Multi-tenant model](./08-multi-tenant-model.md)                     | §3–§4, §129–§130 |
| 09  | [API conventions](./09-api-conventions.md)                           | §91–§93          |
| 10  | [Events, queues, caching](./10-events-queues-caching.md)             | §86, §98, §108   |
| 11  | [Security and privacy](./11-security-and-privacy.md)                 | §105–§106        |
| 12  | [Deployment and observability](./12-deployment-and-observability.md) | §107, §113       |
| 13  | [Phases and testing](./13-phases-and-testing.md)                     | §112, §120–§122  |
