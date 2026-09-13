# 10 — Events, Queues, and Caching

## Domain events

Every meaningful state change emits exactly one event **after** its transaction commits, using a
transactional outbox (`events` table written in the same transaction; a relay publishes to the bus).
This guarantees no phantom events and no lost events.

Event envelope:

```json
{
  "id": "evt_01J...",
  "type": "order.created",
  "version": 1,
  "organizationId": "...",
  "storeId": "...",
  "occurredAt": "2026-09-13T10:00:00Z",
  "actor": { "type": "customer", "id": "..." },
  "data": { "orderId": "..." }
}
```

Catalog (grows per phase):

`user.registered · organization.created · store.created · product.created/updated/deleted ·
inventory.level_changed · customer.created · company.created/approved · catalog.updated ·
price_list.updated · cart.created · cart.item_added · checkout.started · order.created/updated/
cancelled · payment.authorized/captured/failed/refunded · fulfillment.created/shipped/delivered ·
quote.requested/sent/accepted/expired · invoice.issued/paid/overdue · theme.published ·
domain.verified · app.installed · webhook.delivery_failed`

Consumers (all asynchronous, all idempotent on `event.id`): audit log, notifications, webhooks,
search indexing, analytics pipeline, cache invalidation, ERP/CRM adapters.

Behavioural analytics events (`product_viewed`, `search_performed`, ...) are a separate,
high-volume stream ingested from the storefront via a collector endpoint and never written to the
transactional database.

## Queues (BullMQ on Redis)

| Queue          | Jobs                                                        | Concurrency / notes        |
| -------------- | ----------------------------------------------------------- | -------------------------- |
| `outbox-relay` | publish pending events                                      | single, ordered per store  |
| `mail`         | transactional emails                                        | high                       |
| `webhooks`     | deliver, retry with backoff, dead-letter                    | per-endpoint rate limiting |
| `search-index` | upsert/delete documents                                     | batched                    |
| `media`        | image variants (WebP/AVIF/responsive widths), video probes  | CPU-bound, separate worker |
| `imports`      | CSV imports with progress                                   | long-running, resumable    |
| `exports`      | CSV/XLSX exports to storage                                 |                            |
| `analytics`    | roll-ups, materialized metrics                              | scheduled                  |
| `themes`       | publish snapshot, cache purge, scheduled publish            |                            |
| `domains`      | DNS verification polling, certificate provisioning          | scheduled retries          |
| `billing`      | subscription renewals, dunning                              | scheduled                  |
| `housekeeping` | session pruning, idempotency-key expiry, retention policies | scheduled                  |

Rules: every job payload includes the tenant context; every processor is idempotent; failures go to
a dead-letter queue visible in platform-admin with replay; job duration and failure rate are
metrics.

Workers start inside `apps/api` (`WORKER_MODE=inline`) in development and as a separate deployment
of the same image (`WORKER_MODE=only`) in production.

## Caching

| Tier        | What                                                     | TTL / invalidation                               |
| ----------- | -------------------------------------------------------- | ------------------------------------------------ |
| Edge/CDN    | Anonymous storefront HTML, media, theme assets           | `s-maxage` + purge on publish/product change     |
| Next.js     | RSC/fetch cache keyed by store+market+locale             | tags: `store:<id>`, `product:<id>`, `theme:<id>` |
| Redis (API) | Domain→store, permission sets, computed pricing, session | 30–300 s + explicit invalidation via events      |
| Postgres    | Materialized views for dashboards                        | refreshed by `analytics` jobs                    |

Hard rules (spec §129):

- Anything personalized (company price, credit, catalog visibility, quotes, saved lists, customer
  data) is never cached under a key without the principal and never served from a shared edge
  cache. Authenticated storefront responses are `Cache-Control: private, no-store`.
- Cache keys always start with the tenant prefix.
- Invalidation is event-driven, not TTL-only, for price, inventory availability, catalog, and
  theme changes.

## Idempotency store

`idem:<tenant>:<actor>:<key>` → `{ requestHash, status, body }` for 24 h. Written with `SET NX`
before processing (`in_progress`) so concurrent duplicates wait or receive `409`.
