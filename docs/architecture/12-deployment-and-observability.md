# 12 — Deployment and Observability

## Environments

| Env         | Purpose                                     | Data                         |
| ----------- | ------------------------------------------- | ---------------------------- |
| local       | Developer machine, Docker Compose infra     | seeded fixtures              |
| development | Shared integration, auto-deployed from main | seeded + synthetic           |
| staging     | Release candidate, production-like config   | anonymized production subset |
| production  | Live                                        | real                         |

Migrations run with `prisma migrate deploy` as a release step, expand/contract discipline
([06](./06-database-schema-plan.md)). Never test a destructive migration first in production.

## Topology (target)

```
                 ┌──────────────── Cloudflare (DNS, TLS, WAF, edge cache) ────────────────┐
                 │                                                                        │
   platform.com  admin.platform.com   {store}.platform.com / custom domains   api.platform.com
        │                │                          │                                 │
   marketing (Next)  admin (Next)            storefront (Next)                   api (Nest)
        └────────────────┴──────────────────────────┴─────────────────────────────────┤
                                                                                       │
                             ┌──────────────┬────────────────┬──────────────┬──────────┴─────┐
                             PostgreSQL     Redis            S3 + CDN       Meilisearch   Workers
                             (primary +     (sessions,       (media,        (per-store    (BullMQ,
                              read replica)  cache, queues)   theme assets)  indexes)      same image)
```

- Everything ships as containers (one image per app; api and worker share an image).
- Next apps can run on any Node host or a Next-native platform; the storefront needs wildcard +
  custom-domain TLS, which the edge layer provides (Cloudflare for SaaS / custom hostnames).
- Custom domain flow: add → DNS instructions (CNAME to `domains.platform.com` + TXT ownership) →
  verification job → certificate provisioning → routing record → activate.
- Postgres with PITR, connection pooling (PgBouncer/pooler in transaction mode; Prisma configured
  accordingly), read replica for analytics/dashboards.
- Redis with persistence for queues; separate logical DBs for sessions vs cache vs queues.

## CI/CD

`ci.yml` (present): install → format check → lint → typecheck → migrate (fresh DB) → test → build.
Additions per phase: Playwright e2e against a preview deployment, tenant-isolation suite, container
build + scan, deploy to development on merge to `main`, promotion to staging/production via tagged
releases with manual approval.

## Observability

- **Structured logs** (JSON): `requestId`, `orgId`, `storeId`, `actor`, `route`, `durationMs`,
  `status`; no PII. Shipped to a central log store.
- **Tracing**: OpenTelemetry SDK in api and Next servers; trace id propagated through HTTP headers
  and job payloads; spans for DB, Redis, PSP, search calls.
- **Metrics**: RED per route and per queue; DB pool saturation; cache hit ratios; checkout funnel
  step durations; webhook delivery success; theme render errors; storefront TTFB per store.
- **Errors**: centralized error monitoring with release tagging and tenant tags; sampled
  breadcrumbs, PII scrubbing.
- **Uptime**: synthetic checks on `/health`, a canary storefront, and checkout smoke tests.
- **Alerts**: checkout error rate, payment failure spike, job failure rate, queue lag, DB
  replication lag, certificate expiry, webhook dead-letter growth.

`GET /health` (present) reports liveness; `GET /health/ready` (Phase 1) will verify Postgres and
Redis connectivity for orchestrator readiness probes.

## Feature flags

Flag store in Postgres with Redis cache; evaluation `flag(key, { organizationId, storeId,
userId })` supports global default, percentage rollout, and explicit tenant targeting. Used for
progressive rollout, beta features, enterprise-only capabilities, and emergency kill switches.
Managed from platform-admin, audited.
