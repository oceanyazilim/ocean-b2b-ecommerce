# 09 — API Conventions

Style: **REST + JSON** for all first-party surfaces. GraphQL is deliberately not used initially; the
Storefront API may gain a GraphQL façade later for headless customers, backed by the same services.

## Surfaces and versioning

| Surface    | Base path        | Versioning                                  |
| ---------- | ---------------- | ------------------------------------------- |
| Admin      | `/admin/v1`      | path major version                          |
| Storefront | `/storefront/v1` | path major version                          |
| Platform   | `/platform/v1`   | path major version                          |
| Developer  | `/api/<YYYY-MM>` | dated versions with 12-month support window |

Breaking changes require a new version; additive changes (new fields, new endpoints) do not.

## Resource shape

- Plural nouns, kebab-case paths: `/admin/v1/stores/{storeId}/price-lists/{id}`.
- Store-scoped resources always live under `/stores/{storeId}`; the guard verifies membership.
- JSON bodies use `camelCase`. Timestamps are ISO-8601 UTC. Money is `{ amount: <minor int>,
currency: "TRY" }`.
- IDs are opaque strings (UUIDs). Never expose sequential integers except human-facing numbers
  (`order.number`) which are separate from IDs.

## Requests

- Validation via zod schemas in `@ocean/types` (shared with the UI). Unknown keys are rejected on
  writes.
- `Idempotency-Key` header required on: checkout completion, payment create/capture/refund, order
  create, quote accept, theme publish, webhook receipt. Stored 24 h in Redis keyed by
  `(tenant, actor, key)` with a hash of the body; replay returns the original response; a
  different body with the same key returns `409 idempotency_conflict`.
- `X-Request-Id` accepted if present, otherwise generated; echoed back and logged.

## Responses

Success:

```json
{ "data": { ... } }
{ "data": [ ... ], "pageInfo": { "hasNextPage": true, "endCursor": "eyJpZCI6..." } }
```

Error — identical on every surface:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Quantity must be a multiple of 6 (case pack).",
    "requestId": "req_01J...",
    "fields": [{ "path": "items[0].quantity", "message": "Must be a multiple of 6" }]
  }
}
```

Codes: `validation_error 400`, `unauthenticated 401`, `forbidden 403`, `not_found 404`,
`conflict 409`, `idempotency_conflict 409`, `rate_limited 429`, `tenant_context_missing 400`,
`internal_error 500`. Messages are human-readable and specific.

## Lists

- Cursor pagination (`cursor`, `limit ≤ 250`, default 50). Offset pagination is not offered on
  large collections.
- Filtering: `?status=active&vendor=acme&createdAt[gte]=2026-01-01`. Filter vocab per resource is
  declared in its zod query schema.
- Sorting: `?sort=-createdAt,title`.
- Sparse fields/expansion: `?include=variants,media` with a per-endpoint allow-list.
- Saved admin views are just persisted query strings.

## Concurrency

Mutable resources carry `version` (integer). `PATCH` accepts `If-Match: <version>`; a mismatch
returns `409 conflict` with the current resource so the UI can show a merge prompt.

## Rate limiting

Token bucket in Redis per `(surface, tenant, actor)` with entitlement-driven limits
(`api.requests`). Headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`.

## Webhooks (outbound)

Topics `resource.event` (`order.created`, `inventory.updated`, ...). Payload envelope
`{ id, topic, storeId, occurredAt, apiVersion, data }`. Signed with HMAC-SHA256 over the raw body
(`X-Ocean-Signature`, `X-Ocean-Timestamp`) and retried with exponential backoff to a dead-letter
state with replay from the admin.

## Documentation

OpenAPI 3.1 generated from the zod schemas per surface, published at `/admin/v1/openapi.json` etc.
and rendered in `apps/marketing` under `/developers`.
