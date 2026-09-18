import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  assertInfraReachable,
  createOrgAndStore,
  createTestApp,
  INTEGRATION_ENABLED,
  signupVerified,
  uniqueEmail,
  type TestApp,
} from "./integration";
import { NotificationsRelayService } from "../modules/notifications/notifications-relay.service";

const address = { address1: "Sanayi Cd. 5", city: "Ankara", countryCode: "TR" };

describe.skipIf(!INTEGRATION_ENABLED)("phase 13: analytics dashboards, B2B reports, notifications", () => {
  let t: TestApp;
  let owner: ReturnType<TestApp["http"]>;
  let storeId: string;
  let base: string;
  let orderId: string;
  let orderTotal: number;

  beforeAll(async () => {
    await assertInfraReachable();
    t = await createTestApp();
    owner = t.http();
    await signupVerified(t, owner);
    ({ storeId } = await createOrgAndStore(owner, "Analytics Co"));
    base = `/admin/v1/stores/${storeId}`;

    const bolt = (
      await owner
        .post(`${base}/products`)
        .send({
          title: "Steel Bolt",
          status: "active",
          variants: [{ sku: "BOLT-A13", price: 10_000 }],
        })
        .expect(201)
    ).body.data;
    const boltVariantId = bolt.variants[0].id;
    const locationId = (await owner.post(`${base}/locations`).send({ name: "Main" }).expect(201))
      .body.data.id;
    const itemId = (
      await owner.post(`${base}/inventory/items`).send({ productVariantId: boltVariantId }).expect(201)
    ).body.data.id;
    await owner.post(`${base}/inventory/adjustments`).send({ itemId, locationId, delta: 10 }).expect(201);

    const acme = (
      await owner
        .post(`${base}/companies`)
        .send({ legalName: "Analytics Buyer Co", location: { name: "HQ", shippingAddress: address } })
        .expect(201)
    ).body.data;
    const hqId = acme.locations[0].id;
    const buyerId = (
      await owner
        .post(`${base}/companies/${acme.id}/users`)
        .send({ email: uniqueEmail("buyer"), firstName: "Buyer", role: "buyer" })
        .expect(201)
    ).body.data.customer.id;

    const cart = (
      await owner
        .post(`${base}/carts`)
        .send({
          buyer: { customerId: buyerId, companyLocationId: hqId },
          items: [{ variantId: boltVariantId, quantity: 2 }],
        })
        .expect(201)
    ).body.data;
    const placed = (
      await owner
        .post(`${base}/carts/${cart.id}/checkout`)
        .set("Idempotency-Key", "analytics-chk-1")
        .send({ shippingAddress: address })
        .expect(201)
    ).body.data;
    orderId = placed.orderId;
    const order = (await owner.get(`${base}/orders/${orderId}`).expect(200)).body.data;
    orderTotal = order.total.amount;
  });
  afterAll(async () => {
    await t?.close();
  });

  it("reports revenue, top products, and top companies for the order just placed", async () => {
    const overview = (await owner.get(`${base}/analytics/overview`).expect(200)).body.data;
    expect(overview.orderCount).toBeGreaterThanOrEqual(1);
    expect(overview.revenue.amount).toBeGreaterThanOrEqual(orderTotal);
    expect(overview.ordersByStatus.some((s: { status: string }) => s.status === "confirmed")).toBe(true);
    expect(overview.revenueByDay.length).toBeGreaterThanOrEqual(1);

    const topProducts = (await owner.get(`${base}/analytics/top-products`).expect(200)).body.data;
    expect(topProducts[0]).toMatchObject({ sku: "BOLT-A13", quantitySold: 2 });

    const topCompanies = (await owner.get(`${base}/analytics/top-companies`).expect(200)).body.data;
    expect(topCompanies[0]).toMatchObject({ name: "Analytics Buyer Co" });
    expect(topCompanies[0].totalSpent.amount).toBe(orderTotal);

    const topCustomers = (await owner.get(`${base}/analytics/top-customers`).expect(200)).body.data;
    expect(topCustomers[0].orderCount).toBe(1);

    const csv = await owner.get(`${base}/analytics/top-companies/export`).expect(200);
    expect(csv.headers["content-type"]).toMatch(/text\/csv/);
    expect(csv.text).toContain("Analytics Buyer Co");
  });

  it("fans the order.created event out to a notification for every active store member, and lets them mark it read", async () => {
    // Drain the outbox: a shared dev DB can carry a large backlog of older, unrelated
    // DomainEvent rows from earlier test runs (this relay has no other consumer yet), so a
    // single small batch isn't guaranteed to reach the row this test just created.
    const relay = t.app.get(NotificationsRelayService);
    let processed = 0;
    for (let i = 0; i < 500; i++) {
      const n = await relay.processOnce();
      processed += n;
      if (n === 0) break;
    }
    expect(processed).toBeGreaterThanOrEqual(1);

    const unread = (await owner.get(`${base}/notifications/unread-count`).expect(200)).body.data;
    expect(unread.count).toBeGreaterThanOrEqual(1);

    const list = (await owner.get(`${base}/notifications`).expect(200)).body;
    const orderNotification = list.data.find((n: { type: string }) => n.type === "order.created");
    expect(orderNotification).toBeDefined();
    expect(orderNotification.title).toBe("New order");

    await owner.post(`${base}/notifications/${orderNotification.id}/read`).expect(204);
    const afterRead = (await owner.get(`${base}/notifications/unread-count`).expect(200)).body.data;
    expect(afterRead.count).toBe(unread.count - 1);

    await owner.post(`${base}/notifications/read-all`).expect(204);
    const allRead = (await owner.get(`${base}/notifications/unread-count`).expect(200)).body.data;
    expect(allRead.count).toBe(0);
  });

  it("scopes analytics and notifications to the tenant", async () => {
    const stranger = t.http();
    await signupVerified(t, stranger);
    const other = await createOrgAndStore(stranger, "Other Analytics Co");
    const otherOverview = (
      await stranger.get(`/admin/v1/stores/${other.storeId}/analytics/overview`).expect(200)
    ).body.data;
    expect(otherOverview.orderCount).toBe(0);
    await stranger.get(`${base}/analytics/overview`).expect(404);
    await stranger.get(`${base}/notifications`).expect(404);
  });
});
