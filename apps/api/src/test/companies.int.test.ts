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
  company: "ACME Ltd",
  address1: "Sanayi Cd. 5",
  city,
  countryCode: "TR",
  zip: "06000",
});

describe.skipIf(!INTEGRATION_ENABLED)(
  "companies: records, locations, users, applications, isolation",
  () => {
    let t: TestApp;
    let owner: ReturnType<TestApp["http"]>;
    let ownerId: string;
    let storeId: string;
    let base: string;
    let acme: { id: string; version: number };
    let hq: string;
    let branch: string;
    let buyerUserId: string;

    beforeAll(async () => {
      await assertInfraReachable();
      t = await createTestApp();
      owner = t.http();
      ({ userId: ownerId } = await signupVerified(t, owner));
      ({ storeId } = await createOrgAndStore(owner, "B2B Co"));
      base = `/admin/v1/stores/${storeId}`;
    });
    afterAll(async () => {
      await t?.close();
    });

    it("creates a company with its first location as the default", async () => {
      const created = (
        await owner
          .post(`${base}/companies`)
          .send({
            legalName: "ACME Endüstri A.Ş.",
            displayName: "ACME",
            taxNumber: "1234567890",
            taxOffice: "Ankara Kurumlar",
            industry: "manufacturing",
            accountManagerId: ownerId,
            tags: ["distributor"],
            location: { name: "Ankara HQ", shippingAddress: address("Ankara") },
          })
          .expect(201)
      ).body.data;
      expect(created.currency).toBe("TRY");
      expect(created.status).toBe("active");
      expect(created.accountManager.id).toBe(ownerId);
      expect(created.locations).toHaveLength(1);
      expect(created.locations[0]).toMatchObject({ name: "Ankara HQ", isDefault: true });
      expect(created.defaultLocation).toMatchObject({ city: "Ankara", countryCode: "TR" });
      acme = created;
      hq = created.locations[0].id;

      const dupe = await owner
        .post(`${base}/companies`)
        .send({ legalName: "Copycat", taxNumber: "1234567890" })
        .expect(409);
      expect(dupe.body.error.fields[0].path).toBe("taxNumber");

      const noManager = await owner
        .post(`${base}/companies`)
        .send({ legalName: "X", accountManagerId: "00000000-0000-4000-8000-000000000000" })
        .expect(400);
      expect(noManager.body.error.fields[0].path).toBe("accountManagerId");

      const bare = (
        await owner.post(`${base}/companies`).send({ legalName: "Bare Ltd" }).expect(201)
      ).body.data;
      expect(bare.displayName).toBe("Bare Ltd");
      expect(bare.locations).toHaveLength(0);
    });

    it("updates with optimistic locking and changes status", async () => {
      await owner
        .patch(`${base}/companies/${acme.id}`)
        .send({ version: 42, note: "stale" })
        .expect(409);
      const updated = (
        await owner
          .patch(`${base}/companies/${acme.id}`)
          .send({ version: acme.version, website: "acme.example", currency: "EUR" })
          .expect(200)
      ).body.data;
      expect(updated).toMatchObject({ website: "acme.example", currency: "EUR" });
      acme = updated;

      const suspended = (
        await owner
          .post(`${base}/companies/${acme.id}/status`)
          .send({ status: "suspended" })
          .expect(200)
      ).body.data;
      expect(suspended.status).toBe("suspended");
      await owner
        .post(`${base}/companies/${acme.id}/status`)
        .send({ status: "active" })
        .expect(200);
    });

    it("manages locations with one default per company", async () => {
      const created = (
        await owner
          .post(`${base}/companies/${acme.id}/locations`)
          .send({ name: "Izmir Branch", shippingAddress: address("Izmir"), taxExempt: true })
          .expect(201)
      ).body.data;
      expect(created.isDefault).toBe(false);
      branch = created.id;

      await owner
        .post(`${base}/companies/${acme.id}/locations`)
        .send({ name: "Izmir Branch", shippingAddress: address("Izmir") })
        .expect(409);
      await owner
        .patch(`${base}/companies/${acme.id}/locations/${hq}`)
        .send({ isActive: false })
        .expect(400);
      await owner.delete(`${base}/companies/${acme.id}/locations/${hq}`).expect(400);

      await owner.post(`${base}/companies/${acme.id}/locations/${branch}/default`).expect(200);
      const list = (await owner.get(`${base}/companies/${acme.id}/locations`).expect(200)).body
        .data;
      expect(
        list.filter((l: { isDefault: boolean }) => l.isDefault).map((l: { id: string }) => l.id),
      ).toEqual([branch]);
      await owner.post(`${base}/companies/${acme.id}/locations/${hq}/default`).expect(200);

      const billing = (
        await owner
          .patch(`${base}/companies/${acme.id}/locations/${branch}`)
          .send({ billingAddress: address("Istanbul") })
          .expect(200)
      ).body.data;
      expect(billing.billingAddress.city).toBe("Istanbul");
      const cleared = (
        await owner
          .patch(`${base}/companies/${acme.id}/locations/${branch}`)
          .send({ billingAddress: null })
          .expect(200)
      ).body.data;
      expect(cleared.billingAddress).toBeNull();
    });

    it("adds company users from existing customers or by email, scoped to locations", async () => {
      const existing = (
        await owner
          .post(`${base}/customers`)
          .send({ email: uniqueEmail("buyer"), firstName: "Burak" })
          .expect(201)
      ).body.data;
      const buyer = (
        await owner
          .post(`${base}/companies/${acme.id}/users`)
          .send({
            customerId: existing.id,
            role: "buyer",
            allLocations: false,
            locationIds: [branch],
          })
          .expect(201)
      ).body.data;
      expect(buyer.customer.displayName).toBe("Burak");
      expect(buyer.locations.map((l: { name: string }) => l.name)).toEqual(["Izmir Branch"]);
      buyerUserId = buyer.id;

      await owner
        .post(`${base}/companies/${acme.id}/users`)
        .send({ customerId: existing.id, role: "viewer" })
        .expect(409);
      await owner
        .post(`${base}/companies/${acme.id}/users`)
        .send({ customerId: existing.id, role: "buyer", allLocations: false })
        .expect(400);

      const adminEmail = uniqueEmail("admin");
      const admin = (
        await owner
          .post(`${base}/companies/${acme.id}/users`)
          .send({ email: adminEmail, firstName: "Ceren", lastName: "Kaya", role: "company_admin" })
          .expect(201)
      ).body.data;
      expect(admin.customer.email).toBe(adminEmail);
      expect(admin.allLocations).toBe(true);

      const customer = (await owner.get(`${base}/customers/${admin.customer.id}`).expect(200)).body
        .data;
      expect(customer.kind).toBe("company_buyer");
      expect(customer.companies[0]).toMatchObject({ companyName: "ACME", role: "company_admin" });

      const locations = (await owner.get(`${base}/companies/${acme.id}/locations`).expect(200)).body
        .data;
      expect(locations.find((l: { id: string }) => l.id === branch).userCount).toBe(2);
      expect(locations.find((l: { id: string }) => l.id === hq).userCount).toBe(1);

      const buyers = (await owner.get(`${base}/customers?kind=company_buyer`).expect(200)).body
        .data;
      expect(buyers).toHaveLength(2);
      const byCompany = (await owner.get(`${base}/customers?companyId=${acme.id}`).expect(200)).body
        .data;
      expect(byCompany).toHaveLength(2);
    });

    it("updates and removes company users", async () => {
      const promoted = (
        await owner
          .patch(`${base}/companies/${acme.id}/users/${buyerUserId}`)
          .send({ role: "approver", allLocations: true })
          .expect(200)
      ).body.data;
      expect(promoted).toMatchObject({ role: "approver", allLocations: true, locations: [] });

      const foreign = await owner
        .patch(`${base}/companies/${acme.id}/users/${buyerUserId}`)
        .send({ allLocations: false, locationIds: ["00000000-0000-4000-8000-000000000000"] })
        .expect(400);
      expect(foreign.body.error.fields[0].path).toBe("locationIds");

      await owner.delete(`${base}/companies/${acme.id}/users/${buyerUserId}`).expect(204);
      const users = (await owner.get(`${base}/companies/${acme.id}/users`).expect(200)).body.data;
      expect(users).toHaveLength(1);
    });

    it("runs an application through review and approval", async () => {
      const contactEmail = uniqueEmail("applicant");
      const app = (
        await owner
          .post(`${base}/company-applications`)
          .send({
            legalName: "Yeni Toptan Ltd",
            taxNumber: "9876543210",
            contactFirstName: "Deniz",
            contactLastName: "Arslan",
            contactEmail,
            address: address("Bursa"),
            message: "We buy 500 units a month.",
          })
          .expect(201)
      ).body.data;
      expect(app).toMatchObject({ status: "pending", source: "admin" });

      const dupe = await owner
        .post(`${base}/company-applications`)
        .send({
          legalName: "Again",
          contactFirstName: "D",
          contactLastName: "A",
          contactEmail,
        })
        .expect(409);
      expect(dupe.body.error.fields[0].path).toBe("contactEmail");

      const reviewing = (
        await owner.post(`${base}/company-applications/${app.id}/review`).expect(200)
      ).body.data;
      expect(reviewing.status).toBe("under_review");
      expect(reviewing.reviewer.id).toBe(ownerId);

      const approved = (
        await owner
          .post(`${base}/company-applications/${app.id}/approve`)
          .send({ locationName: "Bursa Depo", accountManagerId: ownerId })
          .expect(200)
      ).body.data;
      expect(approved.status).toBe("approved");
      expect(approved.companyId).toBeTruthy();
      expect(approved.customerId).toBeTruthy();

      const company = (await owner.get(`${base}/companies/${approved.companyId}`).expect(200)).body
        .data;
      expect(company).toMatchObject({
        legalName: "Yeni Toptan Ltd",
        taxNumber: "9876543210",
        status: "active",
      });
      expect(company.locations[0]).toMatchObject({ name: "Bursa Depo", isDefault: true });
      const users = (await owner.get(`${base}/companies/${approved.companyId}/users`).expect(200))
        .body.data;
      expect(users).toEqual([
        expect.objectContaining({
          role: "company_admin",
          customer: expect.objectContaining({ email: contactEmail, displayName: "Deniz Arslan" }),
        }),
      ]);

      await owner
        .post(`${base}/company-applications/${app.id}/reject`)
        .send({ note: "too late" })
        .expect(409);

      const pending = (await owner.get(`${base}/company-applications?status=pending`).expect(200))
        .body.data;
      expect(pending).toHaveLength(0);
    });

    it("rejects applications with a note and blocks approval on a taken tax number", async () => {
      const app = (
        await owner
          .post(`${base}/company-applications`)
          .send({
            legalName: "Şüpheli Ltd",
            taxNumber: "1234567890",
            contactFirstName: "S",
            contactLastName: "L",
            contactEmail: uniqueEmail("dubious"),
          })
          .expect(201)
      ).body.data;
      const taken = await owner
        .post(`${base}/company-applications/${app.id}/approve`)
        .send({})
        .expect(409);
      expect(taken.body.error.fields[0].path).toBe("taxNumber");

      await owner.post(`${base}/company-applications/${app.id}/reject`).send({}).expect(400);
      const rejected = (
        await owner
          .post(`${base}/company-applications/${app.id}/reject`)
          .send({ note: "Documents missing" })
          .expect(200)
      ).body.data;
      expect(rejected).toMatchObject({ status: "rejected", decisionNote: "Documents missing" });

      const stats = (await owner.get(`${base}/companies/stats`).expect(200)).body.data;
      expect(stats).toEqual({
        total: 3,
        active: 3,
        suspended: 0,
        archived: 0,
        pendingApplications: 0,
      });
    });

    it("lists, searches and soft-deletes companies", async () => {
      const byTax = (await owner.get(`${base}/companies?q=98765`).expect(200)).body.data;
      expect(byTax.map((c: { legalName: string }) => c.legalName)).toEqual(["Yeni Toptan Ltd"]);
      const byTag = (await owner.get(`${base}/companies?tag=distributor`).expect(200)).body.data;
      expect(byTag.map((c: { id: string }) => c.id)).toEqual([acme.id]);
      const byManager = (await owner.get(`${base}/companies?accountManagerId=${ownerId}`)).body
        .data;
      expect(byManager).toHaveLength(2);
      const candidates = (await owner.get(`${base}/companies/search?q=acme`).expect(200)).body.data;
      expect(candidates[0].displayName).toBe("ACME");

      await owner.delete(`${base}/companies/${acme.id}`).expect(204);
      await owner.get(`${base}/companies/${acme.id}`).expect(404);
      await owner.get(`${base}/companies/${acme.id}/locations`).expect(404);
      const buyers = (await owner.get(`${base}/customers?companyId=${acme.id}`).expect(200)).body
        .data;
      expect(buyers).toHaveLength(0);
      // The tax number is free again once the company is gone.
      await owner
        .post(`${base}/companies`)
        .send({ legalName: "ACME Reborn", taxNumber: "1234567890" })
        .expect(201);
    });

    it("gates writes behind companies.write and hides data across tenants", async () => {
      const viewerEmail = uniqueEmail("viewer");
      await owner
        .post(`${base}/invitations`)
        .send({ email: viewerEmail, role: "viewer" })
        .expect(201);
      const token = linkToken(t.mail.lastTo(viewerEmail)?.text, "invitations");
      const viewer = t.http();
      await signupVerified(t, viewer, viewerEmail);
      await viewer.post("/admin/v1/invitations/accept").send({ token }).expect(200);
      await viewer.get(`${base}/companies`).expect(200);
      await viewer.get(`${base}/company-applications`).expect(200);
      const forbidden = await viewer
        .post(`${base}/companies`)
        .send({ legalName: "No" })
        .expect(403);
      expect(forbidden.body.error.missing).toEqual(["companies.write"]);

      const stranger = t.http();
      await signupVerified(t, stranger);
      const other = await createOrgAndStore(stranger, "Other Co");
      const otherBase = `/admin/v1/stores/${other.storeId}`;
      const mine = (await owner.get(`${base}/companies?limit=1`)).body.data[0];
      await stranger.get(`${base}/companies`).expect(404);
      await stranger.get(`${otherBase}/companies/${mine.id}`).expect(404);
      await stranger.get(`${otherBase}/companies/${mine.id}/locations`).expect(404);
      await stranger
        .post(`${otherBase}/companies/${mine.id}/users`)
        .send({ email: uniqueEmail(), role: "buyer" })
        .expect(404);
      // A foreign customer id cannot be linked into my company.
      const theirs = (
        await stranger
          .post(`${otherBase}/customers`)
          .send({ email: uniqueEmail("theirs") })
          .expect(201)
      ).body.data;
      const crossLink = await owner
        .post(`${base}/companies/${mine.id}/users`)
        .send({ customerId: theirs.id, role: "buyer" })
        .expect(400);
      expect(crossLink.body.error.fields[0].path).toBe("customerId");
      // Same tax number in another store is fine.
      await stranger
        .post(`${otherBase}/companies`)
        .send({ legalName: "Their ACME", taxNumber: "1234567890" })
        .expect(201);
    });
  },
);
