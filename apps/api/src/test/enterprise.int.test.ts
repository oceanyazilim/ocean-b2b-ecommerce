import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  assertInfraReachable,
  createOrgAndStore,
  createTestApp,
  INTEGRATION_ENABLED,
  linkToken,
  PASSWORD,
  signupVerified,
  uniqueEmail,
  type TestApp,
} from "./integration";

// A Set-Cookie response header carries attributes (Path, Max-Age, HttpOnly, ...) that a request
// Cookie header must not — only the name=value pairs.
function toRequestCookie(setCookieHeaders: string[]): string {
  return setCookieHeaders.map((h) => h.split(";")[0]).join("; ");
}

describe.skipIf(!INTEGRATION_ENABLED)("phase 16: custom roles, expanded audit, bulk export, SSO, impersonation", () => {
  let t: TestApp;
  let owner: ReturnType<TestApp["http"]>;
  let ownerEmail: string;
  let organizationId: string;
  let storeId: string;
  let base: string;

  // supertest agents persist every Set-Cookie they receive — including the one an impersonation
  // start/end response carries — so any test that has owner start an impersonation must log
  // owner back into their own account afterward, or every later `owner.*` call in this file
  // would silently keep acting as whoever they last impersonated.
  async function restoreOwnerSession(): Promise<void> {
    await owner.post("/admin/v1/auth/login").send({ email: ownerEmail, password: PASSWORD }).expect(200);
  }

  beforeAll(async () => {
    await assertInfraReachable();
    t = await createTestApp();
    owner = t.http();
    ({ email: ownerEmail } = await signupVerified(t, owner));
    ({ organizationId, storeId } = await createOrgAndStore(owner, "Enterprise Co"));
    base = `/admin/v1/stores/${storeId}`;
  });
  afterAll(async () => {
    await t?.close();
  });

  it("creates a custom role, assigns it to a member, and the engine resolves its exact permissions — no more, no less", async () => {
    const role = (
      await owner
        .post(`${base}/custom-roles`)
        .send({ name: "Order Peeker", permissions: ["orders.read"] })
        .expect(201)
    ).body.data;
    expect(role.memberCount).toBe(0);

    await owner.post(`${base}/custom-roles`).send({ name: "Bad", permissions: ["not.a.permission"] }).expect(400);

    const memberEmail = uniqueEmail("custom");
    await owner.post(`${base}/invitations`).send({ email: memberEmail, role: "viewer" }).expect(201);
    const invite = linkToken(t.mail.lastTo(memberEmail)?.text, "invitations");
    const memberAgent = t.http();
    const { userId: memberUserId } = await signupVerified(t, memberAgent, memberEmail);
    await memberAgent.post("/admin/v1/invitations/accept").send({ token: invite }).expect(200);

    await owner
      .patch(`${base}/members/${memberUserId}`)
      .send({ role: "custom", customRoleId: role.id })
      .expect(204);

    const me = (await memberAgent.get("/admin/v1/auth/me").expect(200)).body.data;
    const store = me.organizations
      .flatMap((o: { stores: { id: string; permissions: string[] }[] }) => o.stores)
      .find((s: { id: string }) => s.id === storeId);
    expect(store.permissions).toContain("orders.read");
    expect(store.permissions).not.toContain("orders.write");
    expect(store.permissions).not.toContain("products.write");

    // Can't delete a role while it's assigned.
    await owner.delete(`${base}/custom-roles/${role.id}`).expect(409);
    await owner.patch(`${base}/members/${memberUserId}`).send({ role: "viewer" }).expect(204);
    await owner.delete(`${base}/custom-roles/${role.id}`).expect(204);
  });

  it("filters and exports the audit log", async () => {
    await owner.post(`${base}/custom-roles`).send({ name: "Filter Probe", permissions: ["products.read"] }).expect(201);

    const filtered = (
      await owner.get(`${base}/audit-logs?resourceType=custom_role&limit=50`).expect(200)
    ).body;
    expect(filtered.data.length).toBeGreaterThanOrEqual(1);
    expect(filtered.data.every((r: { resourceType: string }) => r.resourceType === "custom_role")).toBe(true);

    const csv = await owner.get(`${base}/audit-logs/export?resourceType=custom_role`).expect(200);
    expect(csv.headers["content-type"]).toMatch(/text\/csv/);
    expect(csv.text).toContain("custom_role");
  });

  it("exports the full product catalog as CSV by paging through it internally", async () => {
    await owner
      .post(`${base}/products`)
      .send({ title: "Export Me", status: "active", variants: [{ sku: "EXP-1", price: 2_500 }] })
      .expect(201);
    const csv = await owner.get(`${base}/products/export`).expect(200);
    expect(csv.headers["content-type"]).toMatch(/text\/csv/);
    expect(csv.text).toContain("Export Me");
    expect(csv.text.split("\n")[0]).toBe("Handle,Title,Status,Variant count,Min price,Max price,Currency");
  });

  it("signs a member in through a mock OIDC IdP (start -> callback -> real session), rejects a tampered state and a foreign-domain email", async () => {
    // Unique per run: this shared dev DB accumulates SsoConnection rows across every past test
    // run, and SsoService looks connections up by domain (not by org), so a hard-coded literal
    // domain here would resolve to whichever row happens to be findFirst-ed, possibly a stale
    // one from an earlier run pointing at a mock IdP server that's long since closed.
    const domain = `${uniqueEmail("enterprise-sso").split("@")[0]}.test`;
    let lastUserinfoAuth: string | undefined;
    let userinfoEmail = `person@${domain}`;
    const idp: Server = createServer((req, res) => {
      if (req.url?.startsWith("/token")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ access_token: "mock-access-token" }));
        return;
      }
      if (req.url?.startsWith("/userinfo")) {
        lastUserinfoAuth = req.headers.authorization;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ email: userinfoEmail, name: "SSO Person" }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => idp.listen(0, "127.0.0.1", resolve));
    const port = (idp.address() as AddressInfo).port;
    const idpUrl = (path: string) => `http://127.0.0.1:${port}${path}`;

    try {
      await owner
        .put(`/admin/v1/organizations/${organizationId}/sso`)
        .send({
          domain,
          issuer: idpUrl(""),
          authorizationEndpoint: idpUrl("/authorize"),
          tokenEndpoint: idpUrl("/token"),
          userinfoEndpoint: idpUrl("/userinfo"),
          clientId: "mock-client",
          clientSecret: "mock-secret",
          defaultRole: "member",
        })
        .expect(200);

      const startRes = await owner.get(`/admin/v1/auth/sso/${domain}/start`).expect(302);
      const location = new URL(startRes.headers.location as string);
      expect(location.origin + location.pathname).toBe(idpUrl("/authorize"));
      const state = location.searchParams.get("state") as string;
      expect(state).toBeTruthy();

      // Tampered state is refused before any token exchange happens.
      await owner
        .get(`/admin/v1/auth/sso/callback?code=whatever&state=${state}x`)
        .expect(401);

      const callbackRes = await owner
        .get(`/admin/v1/auth/sso/callback?code=mock-code&state=${encodeURIComponent(state)}`)
        .expect(302);
      expect(callbackRes.headers.location).toBe("http://localhost:3001");
      expect(lastUserinfoAuth).toBe("Bearer mock-access-token");
      const cookie = callbackRes.headers["set-cookie"] as unknown as string[];
      expect(cookie?.length).toBeGreaterThan(0);
      // That Set-Cookie just landed in owner's own cookie jar too (same auto-persist gotcha as
      // impersonation) — restore owner's session before any later owner.* call in this file.
      await restoreOwnerSession();

      const ssoAgent = t.http();
      const me = (
        await ssoAgent.get("/admin/v1/auth/me").set("Cookie", cookie).expect(200)
      ).body.data;
      expect(me.user.email).toBe(`person@${domain}`);
      const org = me.organizations.find((o: { id: string }) => o.id === organizationId);
      expect(org.role).toBe("member");

      // A different email domain is refused even with a validly-signed state.
      userinfoEmail = "person@not-the-right-domain.test";
      const start2 = await owner.get(`/admin/v1/auth/sso/${domain}/start`).expect(302);
      const state2 = new URL(start2.headers.location as string).searchParams.get("state") as string;
      await owner
        .get(`/admin/v1/auth/sso/callback?code=mock-code&state=${encodeURIComponent(state2)}`)
        .expect(401);
    } finally {
      await new Promise<void>((resolve) => idp.close(() => resolve()));
      await restoreOwnerSession();
    }
  });

  it("refuses SSO login as a pre-existing user who isn't already a member of the configuring organization (account-takeover regression)", async () => {
    // A domain unique to this run: SsoConnection.domain has no uniqueness constraint and this
    // is a shared, long-lived dev DB, so a fixed literal here would let a stale connection row
    // from an earlier run of this same test (pointing at a mock IdP that's long since closed)
    // get matched instead of the one this run just created — see the same fix already applied
    // to the SSO test above.
    const victimDomain = `${uniqueEmail("victim-co").split("@")[0]}.test`;
    const victimEmail = `person@${victimDomain}`;

    // The victim: a real user with no relationship at all to `organizationId`/`owner`.
    const victim = t.http();
    await signupVerified(t, victim, victimEmail);
    await createOrgAndStore(victim, "Victim Co");

    // The attacker: a fresh org they fully control, so this test never touches the shared
    // `organizationId` other tests in this file depend on.
    const attacker = t.http();
    await signupVerified(t, attacker);
    const attackerOrg = await createOrgAndStore(attacker, "Attacker Co");

    const assertedEmail = victimEmail; // the attacker's fake IdP asserts the VICTIM's real email
    const idp: Server = createServer((req, res) => {
      if (req.url?.startsWith("/token")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ access_token: "mock-access-token" }));
        return;
      }
      if (req.url?.startsWith("/userinfo")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ email: assertedEmail, name: "Not The Victim" }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => idp.listen(0, "127.0.0.1", resolve));
    const port = (idp.address() as AddressInfo).port;
    const idpUrl = (path: string) => `http://127.0.0.1:${port}${path}`;

    try {
      // The attacker configures their OWN org's SSO connection to claim the victim's exact
      // email domain — exactly what an attacker would do; nothing here verifies they actually
      // own that domain.
      await attacker
        .put(`/admin/v1/organizations/${attackerOrg.organizationId}/sso`)
        .send({
          domain: victimDomain,
          issuer: idpUrl(""),
          authorizationEndpoint: idpUrl("/authorize"),
          tokenEndpoint: idpUrl("/token"),
          userinfoEndpoint: idpUrl("/userinfo"),
          clientId: "mock-client",
          clientSecret: "mock-secret",
          defaultRole: "owner",
        })
        .expect(200);

      const startRes = await attacker.get(`/admin/v1/auth/sso/${victimDomain}/start`).expect(302);
      const state = new URL(startRes.headers.location as string).searchParams.get("state") as string;
      const callbackRes = await attacker
        .get(`/admin/v1/auth/sso/callback?code=mock-code&state=${encodeURIComponent(state)}`)
        .expect(401);
      expect(callbackRes.headers["set-cookie"]).toBeUndefined();

      // The victim's account is completely untouched — no membership in the attacker's org.
      const victimMe = (await victim.get("/admin/v1/auth/me").expect(200)).body.data;
      expect(
        victimMe.organizations.some((o: { id: string }) => o.id === attackerOrg.organizationId),
      ).toBe(false);
    } finally {
      await new Promise<void>((resolve) => idp.close(() => resolve()));
    }
  });

  it("lets a store owner impersonate a member, browse as them with their (lower) permissions, and end back into their own session", async () => {
    const memberEmail = uniqueEmail("imp");
    await owner.post(`${base}/invitations`).send({ email: memberEmail, role: "viewer" }).expect(201);
    const invite = linkToken(t.mail.lastTo(memberEmail)?.text, "invitations");
    const memberAgent = t.http();
    const { userId: memberUserId } = await signupVerified(t, memberAgent, memberEmail);
    await memberAgent.post("/admin/v1/invitations/accept").send({ token: invite }).expect(200);

    const ownerUserId = (await owner.get("/admin/v1/auth/me").expect(200)).body.data.user.id as string;
    // Cannot impersonate yourself.
    await owner.post(`${base}/support/impersonate`).send({ userId: ownerUserId, reason: "test reason" }).expect(403);

    const startRes = await owner
      .post(`${base}/support/impersonate`)
      .send({ userId: memberUserId, reason: "Reproducing a bug they reported" })
      .expect(201);
    expect(startRes.body.data.targetEmail).toBe(memberEmail);
    // The response IS the impersonated session's Set-Cookie — capture it before restoring
    // owner's own session below (the `owner` agent would otherwise keep acting as the member
    // for every later call in this file, since supertest agents auto-persist Set-Cookie).
    // Joined into one string: superagent's cookie-merge logic on a persistent agent expects a
    // string on repeat .set("Cookie", ...) calls and breaks if handed the raw string[] from a
    // Node response header, which is only safe to use as-is for a single one-shot request.
    const cookie = toRequestCookie(startRes.headers["set-cookie"] as unknown as string[]);
    await restoreOwnerSession();
    // Owner's own session works normally again.
    await owner.get(`${base}/custom-roles`).expect(200);

    const impersonating = t.http();
    const status = (
      await impersonating.get(`${base}/support/impersonation-status`).set("Cookie", cookie).expect(200)
    ).body.data;
    expect(status.targetEmail).toBe(memberEmail);

    // Read is fine, write is refused — the impersonated session really carries the viewer's
    // (lower) permissions, not the owner's.
    await impersonating.get(`${base}/orders`).set("Cookie", cookie).expect(200);
    await impersonating
      .patch(`${base}/orders/00000000-0000-0000-0000-000000000000`)
      .set("Cookie", cookie)
      .send({ note: "nope" })
      .expect(403);

    // Ending impersonation works even though the active session has no users.manage — and
    // restores a real session for the original impersonator.
    const endRes = await impersonating.post(`${base}/support/impersonate/end`).set("Cookie", cookie).expect(204);
    const restoredCookie = toRequestCookie(endRes.headers["set-cookie"] as unknown as string[]);
    const restoredMe = (
      await impersonating.get("/admin/v1/auth/me").set("Cookie", restoredCookie).expect(200)
    ).body.data;
    expect(restoredMe.user.email).not.toBe(memberEmail);

    const list = (await owner.get(`${base}/support/impersonations`).expect(200)).body.data;
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].endedAt).not.toBeNull();
  });

  it("gates custom roles and support tooling behind users.manage and isolates tenants", async () => {
    const viewerEmail = uniqueEmail("gate");
    await owner.post(`${base}/invitations`).send({ email: viewerEmail, role: "viewer" }).expect(201);
    const inviteToken = linkToken(t.mail.lastTo(viewerEmail)?.text, "invitations");
    const viewer = t.http();
    await signupVerified(t, viewer, viewerEmail);
    await viewer.post("/admin/v1/invitations/accept").send({ token: inviteToken }).expect(200);
    await viewer.get(`${base}/custom-roles`).expect(403);
    await viewer.post(`${base}/support/impersonate`).send({ userId: "00000000-0000-0000-0000-000000000000", reason: "test reason" }).expect(403);

    const stranger = t.http();
    await signupVerified(t, stranger);
    const other = await createOrgAndStore(stranger, "Other Enterprise Co");
    expect((await stranger.get(`/admin/v1/stores/${other.storeId}/custom-roles`).expect(200)).body.data).toEqual([]);
    await stranger.get(`${base}/custom-roles`).expect(404);
  });
});
