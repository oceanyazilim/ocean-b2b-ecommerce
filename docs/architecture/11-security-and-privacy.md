# 11 — Security and Privacy

## Baseline controls

| Area              | Control                                                                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transport         | TLS everywhere; HSTS; certificates automated per custom domain                                                                                            |
| Headers           | `helmet` defaults + strict CSP per app (nonce-based scripts; storefront CSP allows only platform CDN)                                                     |
| Sessions          | Server-side, HttpOnly/Secure/SameSite cookies, rotation on privilege change ([07](./07-auth-and-rbac.md))                                                 |
| CSRF              | SameSite cookies + double-submit token on state-changing browser requests                                                                                 |
| XSS               | React escaping; rich text sanitized on save and render; no `dangerouslySetInnerHTML` without sanitizer                                                    |
| Injection         | Prisma parameterization; raw SQL only through tagged templates; zod at every boundary                                                                     |
| Auth abuse        | Argon2id, MFA, rate limits, lockout, breached-password check, generic error messages                                                                      |
| Tenant isolation  | Repository scoping + RLS + prefixed caches ([08](./08-multi-tenant-model.md))                                                                             |
| Secrets           | Environment-injected, never committed; per-tenant secrets (webhook secrets, app tokens, TOTP) encrypted at rest with envelope encryption and key rotation |
| API keys / tokens | Hashed at rest, prefix-identifiable, rotatable, scoped, expirable                                                                                         |
| Webhooks          | HMAC signatures with timestamp, replay window, secret rotation with overlap                                                                               |
| Payments          | Card data never touches our servers; PSP hosted fields/tokens; PCI SAQ-A posture                                                                          |
| Uploads           | MIME sniffing, size limits, image re-encoding, AV scan hook, served from a separate origin                                                                |
| Themes            | No merchant JS, schema-validated config, signed preview tokens ([04](./04-theme-engine.md))                                                               |
| Dependencies      | Lockfile, `pnpm audit` in CI, Renovate, minimal `onlyBuiltDependencies` allow-list                                                                        |
| Audit             | Append-only `audit_logs` with actor/resource/before/after/ip/session ([06](./06-database-schema-plan.md))                                                 |
| Backups / DR      | Automated daily snapshots + PITR; restore drill each quarter; RPO ≤ 15 min, RTO ≤ 4 h                                                                     |
| Impersonation     | Authorization required, reason recorded, banner shown, auto-expiry, full audit                                                                            |

## Threat-model highlights

- **Cross-tenant read** — mitigated by context-mandatory repositories, RLS, and per-tenant cache
  keys; tested by automated isolation tests that attempt access with a foreign tenant context.
- **Price/total tampering** — the client sends only variant ids and quantities; every monetary
  value is recomputed server-side at cart, checkout, and order creation.
- **Duplicate charge / order** — idempotency keys on all money-moving endpoints; PSP-side
  idempotency forwarded.
- **Session fixation / theft** — rotation, device binding for MFA, revocation UI, suspicious login
  detection.
- **Malicious theme / app** — no code execution for themes; apps get least-privilege scopes and
  signed, rate-limited webhooks; app blocks receive only permitted data.
- **Support abuse** — impersonation is gated, audited, time-boxed, and visible to the merchant.

## Privacy (GDPR / KVKK)

- **Data inventory**: personal data lives in `users`, `customers`, `customer_addresses`,
  `company_users`, `sessions`, `login_events`, `audit_logs`, order/quote address snapshots,
  analytics events (pseudonymous ids only). Nothing else stores PII.
- **Consent**: cookie consent per storefront with categories; marketing consent stored with
  timestamp, source, and IP on the customer record; consent changes are audited.
- **Rights**: export (machine-readable bundle per customer/user) and erasure (anonymize personal
  fields, keep financial records in pseudonymized form for statutory retention) are background
  jobs triggered from admin/platform-admin with audit trail.
- **Retention**: configurable per store within platform bounds; sessions, login events, and
  analytics raw events have fixed short retention; housekeeping jobs enforce it.
- **Minimization**: services and apps receive the minimum fields; analytics is pseudonymous;
  logs never contain PII beyond ids.
- **Processors**: PSPs, email, storage, and search providers are documented as sub-processors;
  regional data residency is achievable per deployment region (Phase 16).

## Security testing

- Static: TypeScript strict, ESLint security rules, dependency audit, secret scanning.
- Dynamic: authenticated API tests for authz matrix (every endpoint × every role), tenant isolation
  suite, idempotency tests, rate-limit tests.
- Periodic third-party penetration test before general availability and annually after.
