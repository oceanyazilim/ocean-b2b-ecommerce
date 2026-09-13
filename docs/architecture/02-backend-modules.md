# 02 — Backend Module Structure (`apps/api`)

NestJS modular monolith. One process, one database, strict module boundaries.

## Layout

```
apps/api/src/
├── main.ts                     bootstrap: helmet, CORS, shutdown hooks
├── app.module.ts               root module: ConfigModule + domain modules
├── config/
│   └── env.ts                  zod-validated environment (only place reading process.env)
├── common/                     (Phase 1) cross-cutting infrastructure
│   ├── tenant/                 TenantContext, resolver middleware, @CurrentTenant()
│   ├── auth/                   SessionGuard, @CurrentUser(), @Public()
│   ├── permissions/            PermissionGuard, @RequirePermission()
│   ├── errors/                 DomainError hierarchy → ApiError envelope filter
│   ├── idempotency/            IdempotencyInterceptor (Redis-backed)
│   ├── pagination/             cursor helpers
│   ├── validation/             ZodValidationPipe
│   └── request-id/             request id middleware + logger context
├── infrastructure/             adapters to external systems
│   ├── prisma/                 PrismaModule (wraps @ocean/db)
│   ├── redis/                  RedisModule
│   ├── queue/                  BullMQ registration, base processor
│   ├── storage/                S3 adapter
│   ├── search/                 Meilisearch adapter
│   ├── mail/                   transactional mail adapter
│   └── payments/               PaymentProvider interface + adapters
└── modules/                    domain modules (one folder each, see list below)
    └── <domain>/
        ├── <domain>.module.ts
        ├── <domain>.controller.ts        admin surface
        ├── <domain>.storefront.controller.ts (when a storefront API exists)
        ├── <domain>.service.ts           public surface of the module
        ├── <domain>.repository.ts        Prisma queries, tenant-scoped
        ├── dto/                          zod schemas (re-exported to @ocean/types when shared)
        ├── events/                       domain event definitions
        └── __tests__/
```

## Domain modules and phase of arrival

| Module         | Phase | Depends on (via exported services)                   |
| -------------- | ----- | ---------------------------------------------------- |
| health         | 0     | —                                                    |
| auth           | 1     | users, sessions (redis)                              |
| users          | 1     | —                                                    |
| organizations  | 1     | users                                                |
| stores         | 1     | organizations                                        |
| memberships    | 1     | users, organizations, stores                         |
| permissions    | 1     | memberships, @ocean/permissions                      |
| audit          | 1     | (event subscriber)                                   |
| products       | 2     | stores, media                                        |
| collections    | 2     | products                                             |
| media          | 2     | storage adapter                                      |
| metafields     | 2     | —                                                    |
| inventory      | 3     | products, locations                                  |
| locations      | 3     | stores                                               |
| customers      | 4     | stores                                               |
| companies      | 4     | customers                                            |
| catalogs       | 5     | products, companies                                  |
| pricing        | 5     | catalogs, companies, markets                         |
| carts          | 6     | pricing, catalogs, inventory                         |
| checkout       | 6     | carts, pricing, inventory, taxes, shipping, payments |
| orders         | 6     | checkout, inventory                                  |
| payments       | 7     | orders, payment adapters                             |
| shipping       | 7     | orders, locations                                    |
| fulfillments   | 7     | orders, inventory, shipping                          |
| taxes          | 7     | markets                                              |
| returns        | 7     | orders, inventory, payments                          |
| markets        | 8     | stores                                               |
| content        | 8     | stores, media                                        |
| storefront-api | 8     | read-only aggregation over the above                 |
| themes         | 9–11  | stores, media, storefront-api                        |
| domains        | 8     | stores                                               |
| quotes         | 12    | pricing, orders                                      |
| credit         | 12    | companies, orders, finance                           |
| approvals      | 12    | orders, companies                                    |
| finance        | 12    | orders, payments, credit                             |
| discounts      | 12    | pricing                                              |
| analytics      | 13    | event stream                                         |
| notifications  | 13    | queue, mail adapter                                  |
| billing        | 14    | organizations, entitlements                          |
| entitlements   | 14    | billing                                              |
| webhooks       | 15    | queue, event stream                                  |
| apps           | 15    | oauth, webhooks, permissions                         |
| feature-flags  | 14    | organizations, stores                                |

## Module rules

1. A module exports **only** its service(s). Controllers, repositories and DTOs are internal.
2. A module never imports another module's repository or Prisma model directly.
3. Anything that another module needs _after the fact_ (send email, reindex search, update
   analytics, fire webhook) is emitted as a domain event, not called inline.
4. Every repository method takes a `TenantContext` (organization + store) as its first argument.
   No repository method may query a tenant-owned table without it. See
   [08-multi-tenant-model.md](./08-multi-tenant-model.md).
5. Money-moving or state-machine transitions (order status, payment capture, refund, quote accept,
   theme publish) live in the service, run inside a transaction, and emit exactly one event on
   success.
6. Pricing, checkout, and inventory are treated as **service boundaries** from day one: other
   modules call them only through their service interface, never share their tables.

## Error handling

Services throw typed `DomainError` subclasses (`NotFoundError`, `ForbiddenError`,
`ConflictError`, `ValidationError`, `InsufficientInventoryError`, ...). A single exception filter
maps them onto the API envelope described in [09-api-conventions.md](./09-api-conventions.md),
attaching the request id. Messages are written for humans ("Quantity exceeds available inventory
at Istanbul Warehouse (available: 12)"), never "Something went wrong".

## API surfaces served by the same process

| Surface        | Prefix           | Auth                                              | Consumer              |
| -------------- | ---------------- | ------------------------------------------------- | --------------------- |
| Admin API      | `/admin/v1`      | staff session + permissions                       | `apps/admin`          |
| Storefront API | `/storefront/v1` | optional customer session, store context via host | `apps/storefront`     |
| Platform API   | `/platform/v1`   | platform operator session                         | `apps/platform-admin` |
| Health         | `/health`        | none                                              | infra                 |

A future Developer API (`/api/2026-xx`) for third-party apps is a separate versioned surface with
OAuth scopes (Phase 15).
