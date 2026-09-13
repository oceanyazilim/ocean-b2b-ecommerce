# 08 — Multi-Tenant Model

Tenant isolation is a security requirement, enforced at every layer. Frontend restrictions are
never the only control.

## Tenant context

```ts
interface TenantContext {
  organizationId: string;
  storeId: string; // absent only for organization-level endpoints
  actor: { type: "user" | "customer" | "app" | "system" | "platform"; id: string };
  requestId: string;
}
```

Resolved once per request by middleware:

- Admin API: `storeSlug` from the URL → store → organization; membership checked.
- Storefront API: `Host` header → `domains` → store (cached 60 s, invalidated on domain change).
- Platform API: explicit `organizationId`/`storeId` params, audited.
- Background jobs: the enqueuing code **must** put the tenant context in the job payload; the base
  processor refuses jobs without it.

## Enforcement layers

| Layer          | Mechanism                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| API            | Guards reject requests whose session has no membership in the resolved tenant                                       |
| Service        | Services receive `TenantContext` and pass it down; no service method has a tenant-less overload                     |
| Repository     | Every query includes `store_id`/`organization_id`; write helpers set them from context, never from the request body |
| Database       | RLS policies on tenant tables keyed on `app.store_id` set per transaction (`SET LOCAL`)                             |
| Cache          | Keys are prefixed `t:<storeId>:` (or `o:<orgId>:`); personalized data adds `:c:<companyId>` or `:u:<customerId>`    |
| Search index   | One index per store (`products_<storeId>`) or a mandatory `store_id` filter injected server-side                    |
| Object storage | Keys are `stores/<storeId>/...`; signed URLs are minted per tenant                                                  |
| Jobs           | Payload carries tenant; processors construct a `TenantContext` before touching data                                 |
| Analytics      | Every event row carries `store_id`/`organization_id`; queries are always filtered                                   |
| Logs           | Structured fields `org_id`, `store_id` on every line for forensics                                                  |

## Tenant-scoped repository pattern

```ts
class ProductRepository {
  findById(ctx: TenantContext, id: string) {
    return this.prisma.product.findFirst({ where: { id, storeId: ctx.storeId, deletedAt: null } });
  }
  create(ctx: TenantContext, data: CreateProductData) {
    return this.prisma.product.create({
      data: { ...data, storeId: ctx.storeId, organizationId: ctx.organizationId },
    });
  }
}
```

A lint rule (Phase 1) flags Prisma calls on tenant models that lack `storeId` in `where`/`data`.

## Cross-tenant references

- Organization-level resources (members, subscription) reference `organization_id` only.
- Store-level resources may reference organization-level ones, never another store's rows.
- Platform-owned catalogs (themes, plans, apps) have no tenant column; installation rows
  (`store_themes`, `app_installations`) do.

## Cache safety for B2B (spec §129)

Personalized data — company pricing, catalog visibility, credit, payment terms, account manager,
saved lists, quotes — is never stored under a key that omits the principal. Storefront pages served
to an authenticated buyer are `Cache-Control: private, no-store` at the edge; the API layer may
cache computed pricing per `(store, company_location, variant)` with short TTLs and explicit
invalidation on price list / catalog / contract changes.

## Data ownership

- The platform owns operational data; themes consume it; apps receive only what their scopes
  permit; analytics stores derived, tenant-tagged data.
- Deleting a store cascades through tenant tables in a background job that emits audit events and
  respects legal retention (financial records are retained for the statutory period in an archived
  state).
