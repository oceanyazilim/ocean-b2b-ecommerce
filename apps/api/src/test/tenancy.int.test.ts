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

describe.skipIf(!INTEGRATION_ENABLED)("organizations, stores and tenant isolation", () => {
  let t: TestApp;

  beforeAll(async () => {
    await assertInfraReachable();
    t = await createTestApp();
  });
  afterAll(async () => {
    await t?.close();
  });

  it("refuses organization creation before email verification", async () => {
    const agent = t.http();
    await agent
      .post("/admin/v1/auth/signup")
      .send({ email: uniqueEmail(), name: "Unverified", password: PASSWORD })
      .expect(201);
    const res = await agent.post("/admin/v1/organizations").send({ name: "Nope" }).expect(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("creator becomes organization owner and store owner with full permissions", async () => {
    const agent = t.http();
    await signupVerified(t, agent);
    const { organizationId, storeId } = await createOrgAndStore(agent, "Owner Co");

    const me = await agent.get("/admin/v1/auth/me").expect(200);
    const org = me.body.data.organizations.find((o: { id: string }) => o.id === organizationId);
    expect(org.role).toBe("owner");
    const store = org.stores.find((s: { id: string }) => s.id === storeId);
    expect(store.role).toBe("store_owner");
    expect(store.permissions).toEqual(expect.arrayContaining(["users.manage", "themes.publish"]));

    const audit = await agent.get(`/admin/v1/stores/${storeId}/audit-logs`).expect(200);
    expect(audit.body.data.map((e: { action: string }) => e.action)).toContain("store.created");
    expect(audit.body.pageInfo).toEqual({ hasNextPage: false, endCursor: null });
  });

  it("generates unique slugs and rejects a taken explicit slug", async () => {
    const agent = t.http();
    await signupVerified(t, agent);
    const first = await agent
      .post("/admin/v1/organizations")
      .send({ name: "Slug Test" })
      .expect(201);
    const second = await agent
      .post("/admin/v1/organizations")
      .send({ name: "Slug Test" })
      .expect(201);
    expect(second.body.data.slug).toBe(`${first.body.data.slug}-2`);

    const taken = await agent
      .post("/admin/v1/organizations")
      .send({ name: "Other", slug: first.body.data.slug })
      .expect(409);
    expect(taken.body.error.fields[0].path).toBe("slug");
  });

  it("isolates tenants: a member of org A gets 404 on org B's store and organization", async () => {
    const alice = t.http();
    await signupVerified(t, alice);
    const a = await createOrgAndStore(alice, "Alpha");

    const bob = t.http();
    await signupVerified(t, bob);
    const b = await createOrgAndStore(bob, "Beta");

    await bob.get(`/admin/v1/stores/${a.storeId}`).expect(404);
    await bob.get(`/admin/v1/stores/${a.storeId}/members`).expect(404);
    await bob.patch(`/admin/v1/stores/${a.storeId}`).send({ name: "Hacked" }).expect(404);
    await bob.get(`/admin/v1/organizations/${a.organizationId}`).expect(404);
    await bob
      .post(`/admin/v1/organizations/${a.organizationId}/stores`)
      .send({ name: "X", defaultCurrency: "TRY", defaultLocale: "tr", timezone: "UTC" })
      .expect(404);
    await alice.get(`/admin/v1/stores/${b.storeId}`).expect(404);

    // Unknown / malformed ids are indistinguishable from foreign ones.
    await bob.get("/admin/v1/stores/00000000-0000-0000-0000-000000000000").expect(404);
    await bob.get("/admin/v1/stores/not-a-uuid").expect(404);
  });

  it("enforces permissions per role and reports what is missing", async () => {
    const owner = t.http();
    await signupVerified(t, owner);
    const { storeId } = await createOrgAndStore(owner, "Perm Co");

    const viewerEmail = uniqueEmail("viewer");
    await owner
      .post(`/admin/v1/stores/${storeId}/invitations`)
      .send({ email: viewerEmail, role: "viewer" })
      .expect(201);
    const token = linkToken(t.mail.lastTo(viewerEmail)?.text, "invitations");

    const viewer = t.http();
    await signupVerified(t, viewer, viewerEmail);
    const accepted = await viewer.post("/admin/v1/invitations/accept").send({ token }).expect(200);
    expect(accepted.body.data.storeId).toBe(storeId);
    // Accepting twice is a no-op success.
    await viewer.post("/admin/v1/invitations/accept").send({ token }).expect(200);

    await viewer.get(`/admin/v1/stores/${storeId}`).expect(200);
    const forbidden = await viewer
      .post(`/admin/v1/stores/${storeId}/invitations`)
      .send({ email: uniqueEmail(), role: "viewer" })
      .expect(403);
    expect(forbidden.body.error.code).toBe("forbidden");
    expect(forbidden.body.error.missing).toEqual(["users.manage"]);

    await viewer.patch(`/admin/v1/stores/${storeId}`).send({ name: "Nope" }).expect(403);

    const me = await viewer.get("/admin/v1/auth/me").expect(200);
    const store = me.body.data.organizations[0].stores[0];
    expect(store.role).toBe("viewer");
    expect(store.permissions.every((p: string) => p.endsWith(".read"))).toBe(true);
  });

  it("refuses to accept an invitation with a different email", async () => {
    const owner = t.http();
    await signupVerified(t, owner);
    const { storeId } = await createOrgAndStore(owner, "Mismatch Co");
    const invitedEmail = uniqueEmail("invited");
    await owner
      .post(`/admin/v1/stores/${storeId}/invitations`)
      .send({ email: invitedEmail, role: "admin" })
      .expect(201);
    const token = linkToken(t.mail.lastTo(invitedEmail)?.text, "invitations");

    const stranger = t.http();
    await signupVerified(t, stranger);
    const res = await stranger.post("/admin/v1/invitations/accept").send({ token }).expect(400);
    expect(res.body.error.message).toContain(invitedEmail);
  });

  it("protects the last store owner", async () => {
    const owner = t.http();
    const { userId } = await signupVerified(t, owner);
    const { storeId } = await createOrgAndStore(owner, "Last Owner Co");

    const demote = await owner
      .patch(`/admin/v1/stores/${storeId}/members/${userId}`)
      .send({ role: "viewer" })
      .expect(409);
    expect(demote.body.error.code).toBe("conflict");
    await owner.delete(`/admin/v1/stores/${storeId}/members/${userId}`).expect(403);
  });

  it("rate limits repeated logins from one client", async () => {
    const agent = t.http();
    const email = uniqueEmail("limit");
    let last = 0;
    for (let i = 0; i < 11; i += 1) {
      const res = await agent
        .post("/admin/v1/auth/login")
        .set("X-Forwarded-For", "203.0.113.77")
        .send({ email, password: "wrong-password-1" });
      last = res.status;
    }
    expect(last).toBe(429);
  });
});
