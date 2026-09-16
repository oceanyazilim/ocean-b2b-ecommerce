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

const address = (city: string) => ({
  firstName: "Ayşe",
  lastName: "Yılmaz",
  address1: "Bağdat Cd. 12",
  city,
  countryCode: "tr",
  zip: "34000",
});

describe.skipIf(!INTEGRATION_ENABLED)("customers: records, addresses, bulk, isolation", () => {
  let t: TestApp;
  let owner: ReturnType<TestApp["http"]>;
  let storeId: string;
  let base: string;
  let ayse: { id: string; version: number };

  beforeAll(async () => {
    await assertInfraReachable();
    t = await createTestApp();
    owner = t.http();
    await signupVerified(t, owner);
    ({ storeId } = await createOrgAndStore(owner, "Customer Co"));
    base = `/admin/v1/stores/${storeId}`;
  });
  afterAll(async () => {
    await t?.close();
  });

  it("creates a customer with a normalised email and default addresses", async () => {
    const created = (
      await owner
        .post(`${base}/customers`)
        .send({
          email: "  Ayse.Yilmaz@Example.COM ",
          firstName: "Ayşe",
          lastName: "Yılmaz",
          tags: ["vip", "vip", " istanbul "],
          emailMarketing: "subscribed",
          addresses: [address("Istanbul"), address("Ankara")],
        })
        .expect(201)
    ).body.data;
    expect(created.email).toBe("ayse.yilmaz@example.com");
    expect(created.displayName).toBe("Ayşe Yılmaz");
    expect(created.kind).toBe("individual");
    expect(created.tags).toEqual(["vip", "istanbul"]);
    expect(created.emailMarketingUpdatedAt).not.toBeNull();
    expect(created.totalSpent).toEqual({ amount: 0, currency: "TRY" });
    expect(created.addresses).toHaveLength(2);
    expect(created.addresses[0]).toMatchObject({
      isDefaultShipping: true,
      isDefaultBilling: true,
      address: { city: "Istanbul", countryCode: "TR" },
    });
    expect(created.defaultAddress.city).toBe("Istanbul");
    ayse = created;

    const dupe = await owner
      .post(`${base}/customers`)
      .send({ email: "AYSE.YILMAZ@example.com" })
      .expect(409);
    expect(dupe.body.error.fields[0].path).toBe("email");
    await owner.post(`${base}/customers`).send({ email: "not-an-email" }).expect(400);
  });

  it("updates with optimistic locking and tracks marketing consent changes", async () => {
    const stale = await owner
      .patch(`${base}/customers/${ayse.id}`)
      .send({ version: 99, phone: "+90 555" })
      .expect(409);
    expect(stale.body.error.code).toBe("conflict");

    const updated = (
      await owner
        .patch(`${base}/customers/${ayse.id}`)
        .send({ version: ayse.version, phone: "+90 555 000 00 00", emailMarketing: "unsubscribed" })
        .expect(200)
    ).body.data;
    expect(updated.version).toBe(ayse.version + 1);
    expect(updated.phone).toBe("+90 555 000 00 00");
    expect(updated.emailMarketing).toBe("unsubscribed");
    ayse = updated;
  });

  it("manages addresses and keeps exactly one default of each kind", async () => {
    const second = ayse.id;
    const detail = (await owner.get(`${base}/customers/${second}`).expect(200)).body.data;
    const ankara = detail.addresses.find(
      (a: { address: { city: string } }) => a.address.city === "Ankara",
    );
    const promoted = (
      await owner
        .patch(`${base}/customers/${second}/addresses/${ankara.id}`)
        .send({ isDefaultShipping: true })
        .expect(200)
    ).body.data;
    expect(
      promoted.addresses.filter((a: { isDefaultShipping: boolean }) => a.isDefaultShipping),
    ).toHaveLength(1);
    expect(promoted.defaultAddress.city).toBe("Ankara");
    expect(
      promoted.addresses.find((a: { id: string }) => a.id === ankara.id).isDefaultBilling,
    ).toBe(false);

    await owner
      .patch(`${base}/customers/${second}/addresses/${ankara.id}`)
      .send({ isDefaultShipping: false })
      .expect(400);

    const afterDelete = (
      await owner.delete(`${base}/customers/${second}/addresses/${ankara.id}`).expect(200)
    ).body.data;
    expect(afterDelete.addresses).toHaveLength(1);
    expect(afterDelete.addresses[0]).toMatchObject({
      isDefaultShipping: true,
      isDefaultBilling: true,
    });

    const added = (
      await owner
        .post(`${base}/customers/${second}/addresses`)
        .send({ address: address("Izmir"), isDefaultBilling: true })
        .expect(201)
    ).body.data;
    expect(
      added.addresses.filter((a: { isDefaultBilling: boolean }) => a.isDefaultBilling),
    ).toEqual([expect.objectContaining({ address: expect.objectContaining({ city: "Izmir" }) })]);
    await owner
      .post(`${base}/customers/${second}/addresses`)
      .send({ address: { city: "x", countryCode: "TR" } })
      .expect(400);
  });

  it("lists with search, tag and status filters, bulk-tags and reports stats", async () => {
    for (const [i, name] of ["Mehmet", "Zeynep", "Can"].entries()) {
      await owner
        .post(`${base}/customers`)
        .send({ email: uniqueEmail(name.toLowerCase()), firstName: name, tags: i ? ["b2b"] : [] })
        .expect(201);
    }
    const all = (await owner.get(`${base}/customers?limit=2`).expect(200)).body;
    expect(all.data).toHaveLength(2);
    expect(all.pageInfo.hasNextPage).toBe(true);
    const next = (await owner.get(`${base}/customers?limit=2&cursor=${all.pageInfo.endCursor}`))
      .body;
    expect(next.data).toHaveLength(2);
    expect(next.pageInfo.hasNextPage).toBe(false);

    const byName = (await owner.get(`${base}/customers?q=zeyn`).expect(200)).body.data;
    expect(byName.map((c: { firstName: string }) => c.firstName)).toEqual(["Zeynep"]);
    const byTag = (await owner.get(`${base}/customers?tag=b2b`).expect(200)).body.data;
    expect(byTag).toHaveLength(2);

    const ids = byTag.map((c: { id: string }) => c.id);
    const bulk = (
      await owner
        .post(`${base}/customers/bulk`)
        .send({ ids, action: "add_tag", tag: "wholesale" })
        .expect(200)
    ).body.data;
    expect(bulk.affected).toBe(2);
    await owner.post(`${base}/customers/bulk`).send({ ids, action: "add_tag" }).expect(400);
    expect((await owner.get(`${base}/customers?tag=wholesale`)).body.data).toHaveLength(2);

    await owner
      .post(`${base}/customers/bulk`)
      .send({ ids: [ids[0]], action: "disable" })
      .expect(200);
    const disabled = (await owner.get(`${base}/customers?status=disabled`).expect(200)).body.data;
    expect(disabled.map((c: { id: string }) => c.id)).toEqual([ids[0]]);

    const stats = (await owner.get(`${base}/customers/stats`).expect(200)).body.data;
    expect(stats).toEqual({ total: 4, active: 3, disabled: 1, companyBuyers: 0, subscribed: 0 });

    const candidates = (await owner.get(`${base}/customers/search?q=can`).expect(200)).body.data;
    expect(candidates[0].displayName).toBe("Can");
  });

  it("soft-deletes and frees the email for a new record", async () => {
    await owner.delete(`${base}/customers/${ayse.id}`).expect(204);
    await owner.get(`${base}/customers/${ayse.id}`).expect(404);
    const again = (
      await owner.post(`${base}/customers`).send({ email: "ayse.yilmaz@example.com" }).expect(201)
    ).body.data;
    expect(again.id).not.toBe(ayse.id);
    expect(again.addresses).toHaveLength(0);
  });

  it("gates writes behind customers.write", async () => {
    const viewerEmail = uniqueEmail("viewer");
    await owner
      .post(`${base}/invitations`)
      .send({ email: viewerEmail, role: "viewer" })
      .expect(201);
    const token = linkToken(t.mail.lastTo(viewerEmail)?.text, "invitations");
    const viewer = t.http();
    await signupVerified(t, viewer, viewerEmail);
    await viewer.post("/admin/v1/invitations/accept").send({ token }).expect(200);

    await viewer.get(`${base}/customers`).expect(200);
    await viewer.get(`${base}/customers/stats`).expect(200);
    const forbidden = await viewer
      .post(`${base}/customers`)
      .send({ email: uniqueEmail() })
      .expect(403);
    expect(forbidden.body.error.missing).toEqual(["customers.write"]);
  });

  it("hides customers from other tenants", async () => {
    const stranger = t.http();
    await signupVerified(t, stranger);
    const other = await createOrgAndStore(stranger, "Other Co");
    const otherBase = `/admin/v1/stores/${other.storeId}`;
    const mine = (await owner.get(`${base}/customers?limit=1`)).body.data[0];

    await stranger.get(`${base}/customers`).expect(404);
    await stranger.get(`${otherBase}/customers/${mine.id}`).expect(404);
    await stranger
      .patch(`${otherBase}/customers/${mine.id}`)
      .send({ version: 1, note: "x" })
      .expect(404);
    await stranger.delete(`${otherBase}/customers/${mine.id}`).expect(404);
    expect((await stranger.get(`${otherBase}/customers`).expect(200)).body.data).toHaveLength(0);
    // Same email in another store is a different customer.
    await stranger.post(`${otherBase}/customers`).send({ email: mine.email }).expect(201);
  });
});
