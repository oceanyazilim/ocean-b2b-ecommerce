import { PrismaClient } from "@ocean/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  assertInfraReachable,
  createOrgAndStore,
  createTestApp,
  INTEGRATION_ENABLED,
  linkToken,
  signupVerified,
  uniqueEmail,
  type TestApp,
} from "./integration";

describe.skipIf(!INTEGRATION_ENABLED)("phase 14: plans, entitlements, subscriptions, feature flags", () => {
  let t: TestApp;
  let owner: ReturnType<TestApp["http"]>;
  let organizationId: string;
  let storeId: string;
  let base: string;
  let growthPlanId: string;
  let prisma: PrismaClient;

  beforeAll(async () => {
    await assertInfraReachable();
    t = await createTestApp();
    prisma = new PrismaClient();
    owner = t.http();
    await signupVerified(t, owner);
    ({ organizationId, storeId } = await createOrgAndStore(owner, "Billing Co"));
    base = `/admin/v1/organizations/${organizationId}/billing`;
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await t?.close();
  });

  it("lists the seeded plan catalog", async () => {
    const plans = (await owner.get("/admin/v1/billing/plans").expect(200)).body.data;
    const codes = plans.map((p: { code: string }) => p.code);
    expect(codes).toEqual(expect.arrayContaining(["starter", "growth", "enterprise"]));
    const growth = plans.find((p: { code: string }) => p.code === "growth");
    expect(growth.entitlements["stores.max"]).toBe(5);
    growthPlanId = growth.id;
  });

  it("gives a fresh organization a trialing Starter subscription lazily, enforces its stores.max, and upgrades to lift it", async () => {
    const sub = (await owner.get(`${base}/subscription`).expect(200)).body.data;
    expect(sub.plan.code).toBe("starter");
    expect(sub.status).toBe("trialing");
    expect(sub.usage.storesUsed).toBe(1);
    expect(sub.usage.storesMax).toBe(1);

    // Starter allows exactly 1 store, and createOrgAndStore already created one — a second is refused.
    const blocked = await owner
      .post(`/admin/v1/organizations/${organizationId}/stores`)
      .send({ name: "Second Store", defaultCurrency: "TRY", defaultLocale: "tr", timezone: "Europe/Istanbul" })
      .expect(403);
    expect(blocked.body.error.message).toMatch(/stores\.max/);

    const upgraded = (
      await owner.post(`${base}/subscription`).send({ planId: growthPlanId }).expect(201)
    ).body.data;
    expect(upgraded.plan.code).toBe("growth");
    expect(upgraded.status).toBe("active");
    expect(upgraded.usage.storesMax).toBe(5);

    // Growth is a paid plan, so changing to it creates a real, immediately-paid platform invoice
    // (there's no PSP wired up for platform billing, so "paid immediately" is the honest stand-in).
    const invoices = (await owner.get(`${base}/invoices`).expect(200)).body.data;
    expect(invoices[0]).toMatchObject({ status: "paid" });
    expect(invoices[0].amount.amount).toBeGreaterThan(0);

    // Now within the higher limit, the second store succeeds.
    await owner
      .post(`/admin/v1/organizations/${organizationId}/stores`)
      .send({ name: "Second Store", defaultCurrency: "TRY", defaultLocale: "tr", timezone: "Europe/Istanbul" })
      .expect(201);
  });

  it("cancels the subscription", async () => {
    const canceled = (await owner.post(`${base}/subscription/cancel`).send({}).expect(201)).body.data;
    expect(canceled.status).toBe("canceled");
    expect(canceled.canceledAt).not.toBeNull();
  });

  it("lists feature flags with the org's effective value and lets billing toggle an override", async () => {
    const flags = (await owner.get(`${base}/feature-flags`).expect(200)).body.data;
    const custom = flags.find((f: { key: string }) => f.key === "beta.custom_domains");
    expect(custom).toMatchObject({ enabled: false, overridden: false });

    const toggled = (
      await owner.patch(`${base}/feature-flags/beta.custom_domains`).send({ enabled: true }).expect(200)
    ).body.data;
    expect(toggled).toMatchObject({ enabled: true, overridden: true });

    const after = (await owner.get(`${base}/feature-flags`).expect(200)).body.data;
    expect(after.find((f: { key: string }) => f.key === "beta.custom_domains")).toMatchObject({
      enabled: true,
      overridden: true,
    });
  });

  it("gates billing behind organization.billing (a plain member is refused, the dedicated billing role is not) and isolates tenants", async () => {
    // The store-invite flow (the only invite path this API exposes) always grants the invitee
    // the "member" organization role — there's no API to invite someone directly as org
    // "admin"/"billing" (a real, if narrow, gap; not this phase's job to fill). A plain member
    // is exactly what most invited staff get, so it's still a meaningful negative case; the
    // positive "billing" role case is set up with a direct DB write, same as other tests in
    // this suite reach past the API for fixture setup.
    const memberEmail = uniqueEmail("member");
    await owner
      .post(`/admin/v1/stores/${storeId}/invitations`)
      .send({ email: memberEmail, role: "viewer" })
      .expect(201);
    const memberInvite = linkToken(t.mail.lastTo(memberEmail)?.text, "invitations");
    const memberAgent = t.http();
    const { userId: memberUserId } = await signupVerified(t, memberAgent, memberEmail);
    await memberAgent.post("/admin/v1/invitations/accept").send({ token: memberInvite }).expect(200);
    const forbidden = await memberAgent.get(`${base}/subscription`).expect(403);
    expect(forbidden.body.error.missing).toEqual(["organization.billing"]);

    await prisma.organizationMember.update({
      where: { organizationId_userId: { organizationId, userId: memberUserId } },
      data: { role: "billing" },
    });
    await memberAgent.get(`${base}/subscription`).expect(200);

    const stranger = t.http();
    await signupVerified(t, stranger);
    const other = await createOrgAndStore(stranger, "Other Billing Co");
    await stranger.get(`${base}/subscription`).expect(404);
    await stranger.get(`/admin/v1/organizations/${other.organizationId}/billing/subscription`).expect(200);
  });
});
