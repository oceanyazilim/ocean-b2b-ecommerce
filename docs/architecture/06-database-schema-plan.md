# 06 — Database Schema Plan

PostgreSQL 16, Prisma (`packages/db`). Migrations are the only way schema changes reach any
environment.

## Global conventions

- Primary keys: `uuid` (v7-ordered via app-side generator where insertion order matters).
- `created_at timestamptz not null default now()`, `updated_at timestamptz not null` on every table.
- Tenant-owned tables carry `organization_id` and `store_id` (both `not null`, FK, indexed). Tables
  that are organization-level only (subscriptions, org members) carry `organization_id` alone.
- Composite uniqueness is always tenant-scoped, e.g. `unique (store_id, handle)`.
- Money is stored as `bigint` minor units + `char(3)` currency. Never float.
- Soft delete (`deleted_at`) only where restore is a product feature (products, customers,
  companies). Everything else is hard-deleted inside a transaction with an audit event.
- Enumerations are Postgres enums when the set is closed by the platform (order status), and
  lookup tables when merchants can extend them (return reasons).
- JSONB is used for schema-validated documents (theme configuration, metafield values,
  address snapshots), never as a substitute for relations.
- Row Level Security: enabled on tenant-owned tables with policies keyed on
  `current_setting('app.store_id')`; the API sets the setting per transaction. RLS is defence in
  depth behind the repository-level scoping, not a replacement for it.

## Entity map by domain

### Identity & tenancy (Phase 1)

```
users                    id, email (unique, citext), password_hash, email_verified_at, mfa_enabled,
                         status, last_login_at
user_mfa_secrets         user_id, totp_secret (encrypted), recovery_codes (hashed)
sessions                 id, user_id, realm (merchant|platform|customer), device, ip, user_agent,
                         expires_at, revoked_at, remembered
login_events             user_id, ip, user_agent, outcome, risk_flags
organizations            id, name, slug (unique), status, owner_user_id
organization_members     organization_id, user_id, role, invited_by, accepted_at
stores                   id, organization_id, name, slug (unique), default_currency, default_locale,
                         timezone, status, business_type, industry, onboarding_state jsonb
store_members            store_id, user_id, role_id, status
roles                    id, store_id (null = built-in), name, is_builtin
role_permissions         role_id, permission
invitations              organization_id/store_id, email, role, token_hash, expires_at
audit_logs               organization_id, store_id, actor_user_id, actor_type, action, resource_type,
                         resource_id, before jsonb, after jsonb, ip, session_id, metadata, created_at
```

### Catalog (Phase 2)

```
products                 store_id, title, handle, description_rich jsonb, vendor, brand,
                         product_type, category_id, status, seo jsonb, template_suffix, deleted_at
product_options          product_id, name, position
product_option_values    option_id, value, position
product_variants         product_id, sku, barcode, title, price, compare_at_price, cost,
                         weight, weight_unit, dimensions jsonb, taxable, requires_shipping,
                         inventory_item_id, position
variant_option_values    variant_id, option_value_id
product_media            product_id, media_id, position, alt
media                    store_id, kind, storage_key, mime, bytes, width, height, duration, alt
collections              store_id, title, handle, type (manual|automated), rules jsonb, sort_order
collection_products      collection_id, product_id, position
metafield_definitions    store_id, owner_type, namespace, key, type, validations jsonb
metafields               store_id, owner_type, owner_id, definition_id, value jsonb
product_tags             product_id, tag
categories               store_id, parent_id, name, handle, path
publications             store_id, channel, product_id, published_at
```

### Inventory (Phase 3)

```
inventory_locations      store_id, name, type, address jsonb, active, fulfills_online
inventory_items          store_id, variant_id, tracked, cost
inventory_levels         inventory_item_id, location_id, on_hand, available, reserved,
                         committed, incoming, damaged      unique(item, location)
inventory_movements      store_id, inventory_item_id, location_id, quantity_delta, reason,
                         reference_type, reference_id, actor, note     (append-only ledger)
inventory_transfers      store_id, from_location_id, to_location_id, status, reference
inventory_transfer_items transfer_id, inventory_item_id, quantity, received_quantity
```

### Customers & B2B (Phase 4)

```
customers                store_id, email (unique per store while live), first_name, last_name,
                         phone, status, tags[], note, locale, tax_exempt, email_marketing +
                         email_marketing_updated_at, password_hash / account_activated_at (Phase 8
                         login), orders_count, total_spent, last_order_at, version, deleted_at
customer_addresses       customer_id, address jsonb, is_default_shipping, is_default_billing
                         (one default of each per customer, partial unique indexes)
companies                store_id, legal_name, display_name, tax_number (unique per store while
                         live), tax_office, industry, currency, status (active|suspended|archived),
                         account_manager_id -> users, external_id, website, phone, email, note,
                         tags[], version, deleted_at
company_locations        company_id, name (unique per company), external_id, phone, email,
                         shipping_address jsonb, billing_address jsonb?, currency?, tax_exempt,
                         tax_number, is_default (one per company), is_active, note
company_users            company_id, customer_id (unique pair), role (company_admin|buyer|approver|
                         finance|viewer), status, title, all_locations
company_user_locations   company_user_id, company_location_id (explicit scope when all_locations=false)
company_applications     store_id, status (pending|under_review|approved|rejected), source, legal_name,
                         tax fields, contact_*, address jsonb, message, customer_id?, reviewer_id,
                         reviewed_at, decision_note, company_id (set on approval)
company_application_documents  application_id, media_id
```

### Catalog access & pricing (Phase 5)

```
catalogs                 store_id, name, status
catalog_products         catalog_id, product_id (or variant_id), included
catalog_assignments      catalog_id, company_id | company_location_id | customer_group_id
price_lists              store_id, name, currency, adjustment_type, adjustment_value, priority
price_list_prices        price_list_id, variant_id, price, compare_at_price
price_list_assignments   price_list_id, company_id | company_location_id | market_id | catalog_id
volume_pricing_rules     store_id, scope (variant|product|collection), scope_id, price_list_id?,
                         tiers jsonb [{min_qty, price | percent_off}]
quantity_rules           store_id, scope, scope_id, min, max, increment, case_pack
contract_prices          company_id | company_location_id, variant_id, price, valid_from, valid_to
```

### Commerce (Phase 6–7)

```
carts                    store_id, customer_id?, company_id?, company_location_id?, currency,
                         market_id, po_number, note, status, expires_at
cart_items               cart_id, variant_id, quantity, properties jsonb, unit_price_snapshot
orders                   store_id, number, customer_id?, company_id?, company_location_id?,
                         currency, status, payment_status, fulfillment_status, source, po_number,
                         subtotal, discount_total, shipping_total, tax_total, total,
                         billing_address jsonb, shipping_address jsonb, note, tags, cancelled_at
order_items              order_id, variant_id, sku, title, quantity, unit_price, discount,
                         tax, total, fulfillable_quantity, refunded_quantity
order_discounts          order_id, discount_id?, code, type, amount
order_events             order_id, type, payload, actor
draft_orders             store_id, ..., status, invoice_sent_at, completed_order_id
payments                 store_id, order_id, provider, provider_ref, method, status, amount,
                         currency, idempotency_key
transactions             payment_id, kind (authorize|capture|void|refund), amount, status, raw jsonb
refunds                  order_id, payment_id, amount, reason, restock, status
fulfillments             order_id, location_id, status, tracking jsonb, shipped_at
fulfillment_items        fulfillment_id, order_item_id, quantity
shipping_zones           store_id, name, countries[], regions[]
shipping_profiles        store_id, name, product_scope
shipping_rates           zone_id, profile_id, type, price, conditions jsonb, carrier_config
returns                  order_id, status, reason_id, resolution, received_at, inspected_at
return_items             return_id, order_item_id, quantity, condition
tax_rules                store_id, market_id?, country, region?, rate, class, inclusive
tax_classes              store_id, name
markets                  store_id, name, countries[], currency, locales[], domain_id?,
                         price_adjustment, tax_behavior, catalog_id?
idempotency_keys         scope, key, request_hash, response jsonb, expires_at
```

### B2B advanced (Phase 12)

```
quotes                   store_id, number, company_id, company_location_id, customer_id, status,
                         currency, expires_at, payment_terms jsonb, notes, internal_notes,
                         converted_order_id
quote_items              quote_id, variant_id, quantity, unit_price, discount, note
quote_events             quote_id, type, payload, actor
quote_attachments        quote_id, media_id
credit_accounts          company_id | company_location_id, limit, used, currency, on_exceed policy
credit_ledger            credit_account_id, delta, reference_type, reference_id
payment_terms_templates  store_id, name, type (immediate|net|deposit|scheduled), config jsonb
invoices                 store_id, order_id, company_id, number, due_at, status, amount, paid_amount
invoice_payments         invoice_id, payment_id, amount
approval_rules           store_id, company_id?, conditions jsonb, approver_roles[]
approvals                order_id | quote_id, rule_id, status, decided_by, decided_at, note
saved_lists              store_id, customer_id | company_id, name
saved_list_items         list_id, variant_id, quantity
discounts                store_id, type, method (code|automatic), value, conditions jsonb,
                         starts_at, ends_at, usage_limit, usage_count
discount_codes           discount_id, code (unique per store)
```

### Content, themes, domains (Phase 8–11)

```
pages / blogs / articles store_id, title, handle, body_rich jsonb, seo jsonb, published_at,
                         template_suffix
menus / menu_items       store_id, handle, title; parent_id, label, url/resource ref, position
redirects                store_id, from_path, to_path
files                    store_id, media_id, purpose
themes                   id, slug, name, description, category, status
theme_releases           theme_id, version, manifest jsonb, released_at
store_themes             store_id, theme_id, theme_release_id, name, role (main|unpublished),
                         published_version_id, published_at
store_theme_versions     store_theme_id, number, global_settings jsonb, status (draft|published|
                         archived), etag, created_by, note, published_at
theme_template_versions  theme_version_id, template_type, template_name, configuration jsonb
theme_preview_tokens     store_theme_version_id, token_hash, expires_at, password_hash?
domains                  store_id, hostname (unique), type (default|custom), status,
                         verification_token, verified_at, ssl_status, primary
```

### Platform (Phase 13–15)

```
plans                    code, name, prices jsonb, status
entitlements             plan_id, key, value
subscriptions            organization_id, plan_id, status, trial_ends_at, current_period,
                         provider_ref, cancel_at
platform_invoices        organization_id, subscription_id, amount, status, due_at
feature_flags            key, description, default_on
feature_flag_targets     flag_id, organization_id | store_id, enabled
apps / app_installations app scopes; store_id, app_id, granted_scopes, status, tokens (encrypted)
webhooks                 store_id, app_installation_id?, topic, url, secret (encrypted), status
webhook_deliveries       webhook_id, event_id, attempt, status, response_code, next_retry_at
events                   store_id, organization_id, type, payload jsonb, occurred_at  (outbox)
jobs                     queue, name, status, tenant refs, attempts, last_error
notifications            store_id, user_id | customer_id, channel, template, payload, read_at
email_templates          store_id, key, subject, body, locale, version
impersonation_sessions   platform_user_id, target_user_id, store_id, reason, expires_at, ended_at
```

## Indexing guidelines

- Every FK gets an index. Every `(store_id, <lookup>)` pair used by a list screen gets a composite
  index (e.g. `orders(store_id, created_at desc)`, `products(store_id, status, updated_at desc)`).
- Search-facing text fields (product title, SKU, customer email) get `pg_trgm` GIN indexes until the
  dedicated search index takes over, and remain as the fallback.
- JSONB documents that are queried (metafield values, automated collection rules) get expression
  indexes on the specific keys, never a blanket GIN unless proven necessary.

## Migration policy

- One migration per module change, reviewed with the code.
- Expand → migrate data → contract, in separate deploys, for any change touching populated tables.
- Migrations are run by CI against a fresh database on every PR and by `prisma migrate deploy` in
  releases. Never `db push` outside a throwaway local DB.
