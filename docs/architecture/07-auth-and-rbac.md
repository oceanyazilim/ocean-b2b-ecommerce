# 07 — Authentication and RBAC

## Identity model

**Platform identity** (a `user`) is separate from **membership** (what that user may do inside an
organization, store, or company). One user can belong to many organizations and stores with
different roles in each.

Three auth realms share the same primitives but never share sessions:

| Realm    | Who                       | App(s)                 | Cookie             |
| -------- | ------------------------- | ---------------------- | ------------------ |
| merchant | Merchant staff            | admin                  | `ocean_ms`         |
| platform | Platform operators        | platform-admin         | `ocean_ps`         |
| customer | Shoppers / company buyers | storefront (per store) | `ocean_cs_<store>` |

## Sessions

- Server-side sessions in Redis (`session:<realm>:<id>` → user id, realm, store/org context,
  device fingerprint, issued/expires, MFA state). The cookie holds only an opaque, HMAC-signed id.
- `HttpOnly; Secure; SameSite=Lax` (Strict for platform realm); rotated on privilege change
  (login, MFA pass, password change).
- Idle timeout + absolute lifetime; "remember this device" extends idle timeout only for
  MFA-verified devices.
- Users can list and revoke sessions; revocation is immediate because state is server-side.
- Login history (`login_events`) records ip, user agent, outcome, and risk flags (new device, new
  country, impossible travel, credential-stuffing velocity). Risky logins force MFA/step-up.

## Credentials

- Passwords hashed with **argon2id** (memory 64 MiB, iterations 3, parallelism 1), rehashed on
  login when parameters change. Breached-password check on set.
- Email verification and password reset use single-use, hashed tokens with short TTLs.
- MFA: TOTP (RFC 6238) with encrypted secret + hashed recovery codes. WebAuthn planned.
- Brute-force protection: per-account and per-IP sliding windows in Redis; lockout with
  exponential backoff; generic error messages that don't reveal account existence.

## Provider abstraction (future SSO)

```ts
interface IdentityProvider {
  kind: "password" | "google" | "microsoft" | "oidc" | "saml";
  beginLogin(ctx): Promise<Challenge>;
  completeLogin(ctx, response): Promise<VerifiedIdentity>;
}
```

`AuthService` composes providers; the session layer is provider-agnostic. Enterprise SSO (Phase 16)
plugs in `oidc`/`saml` providers plus org-level enforcement ("members of ACME Holding must use
SSO") without touching controllers or guards.

## Authorization

Permission strings and built-in roles live in `@ocean/permissions` and are the single source of
truth for API and UI. Scopes:

| Scope        | Roles (built-in)                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| organization | owner, admin, billing, member                                                                            |
| store        | store_owner, admin, store_manager, product_manager, order_manager, marketing, finance, developer, viewer |
| company      | company_admin, buyer, approver, finance, viewer                                                          |

Custom store roles (Phase 16) are rows in `roles`/`role_permissions` evaluated by the same engine.

### Resolution

```
request ─► session ─► user ─► TenantContext (org, store from URL/host)
        ─► memberships for (user, org, store) ─► role(s) ─► PermissionSet (cached in Redis, 60 s,
        invalidated on role change) ─► PermissionGuard checks @RequirePermission(requirement)
```

`requirement` is a `PermissionRequirement` (single permission, `allOf`, `anyOf`). On failure the
API returns `403 forbidden` with the missing permissions so the UI can explain, never silently hide.

### Rules

1. Controllers declare requirements; services assume the caller is authorized but re-check
   **resource ownership** (the order belongs to this store) via the tenant-scoped repository.
2. UI uses the same `satisfies()` to show/hide/disable — UX only.
3. Platform operators have no implicit merchant permissions. Impersonation creates a time-boxed
   merchant-realm session flagged `impersonated_by`, is audited, and renders a persistent banner.
4. Organization `owner` cannot be removed while sole owner; ownership transfer is explicit.
5. Company roles are evaluated in the customer realm; a buyer's permission set is scoped to the
   company locations they are assigned to.

## Audit

Every auth-relevant event (login, logout, failed login, MFA enrol/disable, password change, session
revoke, role change, invitation, impersonation start/stop) writes an `audit_logs` row with actor,
target, ip, session, and metadata.
