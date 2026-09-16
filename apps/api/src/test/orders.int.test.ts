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

const address = { address1: "Sanayi Cd. 5", city: "Ankara", countryCode: "TR" };

describe.skipIf(!INTEGRATION_ENABLED)("commerce: carts, checkout, orders, draft orders", () => {
  let t: TestApp;
  let owner: ReturnType<TestApp["http"]>;
  let storeId: string;
  let base: string;
  let boltId: string;
  let boltM6: string;
  let gloveL: string;
  let locationId: string;
  let boltItemId: string;
  let acmeId: string;
  let hqId: string;
  let buyerId: string;
  let firstOrderId: string;

  beforeAll(async () => {
    await assertInfraReachable();
    t = await createTestApp();
    owner = t.http();
    await signupVerified(t, owner);
    ({ storeId } = await createOrgAndStore(owner, "Commerce Co"));
    base = `/admin/v1/stores/${storeId}`;
    const bolt = (
      await owner
        .post(`${base}/products`)
        .send({
          title: "Steel Bolt",
          status: "active",
          options: [{ name: "Size", values: ["M6"] }],
          variants: [{ optionValues: ["M6"], sku: "BOLT-M6", price: 10_000 }],
        })
        .expect(201)
    ).body.data;
    boltId = bolt.id;
    boltM6 = bolt.variants[0].id;
    gloveL = (
      await owner
        .post(`${base}/products`)
        .send({
          title: "Work Glove",
          status: "active",
          variants: [{ sku: "GLOVE-L", price: 5_000 }],
        })
        .expect(201)
    ).body.data.variants[0].id;
    locationId = (await owner.post(`${base}/locations`).send({ name: "Main" }).expect(201)).body
      .data.id;
    boltItemId = (
      await owner.post(`${base}/inventory/items`).send({ productVariantId: boltM6 }).expect(201)
    ).body.data.id;
    await owner
      .post(`${base}/inventory/adjustments`)
      .send({ itemId: boltItemId, locationId, delta: 10 })
      .expect(201);
    const acme = (
      await owner
        .post(`${base}/companies`)
        .send({ legalName: "ACME Ltd", location: { name: "HQ", shippingAddress: address } })
        .expect(201)
    ).body.data;
    acmeId = acme.id;
    hqId = acme.locations[0].id;
    buyerId = (
      await owner
        .post(`${base}/companies/${acmeId}/users`)
        .send({ email: uniqueEmail("buyer"), firstName: "Burak", role: "buyer" })
        .expect(201)
    ).body.data.customer.id;
    const list = (
      await owner
        .post(`${base}/price-lists`)
        .send({ name: "Wholesale", status: "active", adjustmentBps: -2000 })
        .expect(201)
    ).body.data;
    await owner
      .post(`${base}/price-lists/${list.id}/assignments`)
      .send({ companyId: acmeId })
      .expect(201);
    await owner
      .put(`${base}/pricing/quantity-rules`)
      .send({ scope: "product", scopeId: boltId, increment: 2 })
      .expect(200);
  });
  afterAll(async () => {
    await t?.close();
  });

  it("builds a priced cart for a company buyer and reports problems before checkout", async () => {
    const cart = (
      await owner
        .post(`${base}/carts`)
        .send({
          buyer: { customerId: buyerId, companyLocationId: hqId },
          items: [{ variantId: boltM6, quantity: 3 }],
        })
        .expect(201)
    ).body.data;
    expect(cart.buyer.company.displayName).toBe("ACME Ltd");
    expect(cart.buyer.location.name).toBe("HQ");
    expect(cart.items[0]).toMatchObject({
      sku: "BOLT-M6",
      unitPrice: { amount: 8_000 },
      priceSource: "price_list",
      available: 10,
    });
    expect(cart.ready).toBe(false);
    expect(cart.problems[0]).toMatch(/multiples of 2/);

    const fixed = (
      await owner
        .patch(`${base}/carts/${cart.id}/items/${cart.items[0].id}`)
        .send({ quantity: 4 })
        .expect(200)
    ).body.data;
    expect(fixed.ready).toBe(true);
    expect(fixed.totals).toMatchObject({
      subtotal: { amount: 32_000 },
      shippingTotal: { amount: 0 },
      taxTotal: { amount: 0 },
      total: { amount: 32_000 },
      itemCount: 4,
    });

    const withGloves = (
      await owner
        .post(`${base}/carts/${cart.id}/items`)
        .send({ variantId: gloveL, quantity: 2 })
        .expect(200)
    ).body.data;
    expect(withGloves.items).toHaveLength(2);
    expect(withGloves.items[1]).toMatchObject({ available: null, unitPrice: { amount: 4_000 } });
    await owner
      .post(`${base}/carts/${cart.id}/items`)
      .send({ variantId: gloveL, quantity: 1 })
      .expect(200);
    const merged = (await owner.get(`${base}/carts/${cart.id}`).expect(200)).body.data;
    expect(merged.items.find((i: { sku: string }) => i.sku === "GLOVE-L").quantity).toBe(3);
    await owner.delete(`${base}/carts/${cart.id}/items/${merged.items[1].id}`).expect(200);

    // Buyers who are not members of the company are refused.
    const stranger = (
      await owner
        .post(`${base}/customers`)
        .send({ email: uniqueEmail("solo") })
        .expect(201)
    ).body.data;
    const notMember = await owner
      .post(`${base}/carts`)
      .send({ buyer: { customerId: stranger.id, companyId: acmeId }, items: [] })
      .expect(400);
    expect(notMember.body.error.fields[0].path).toBe("buyer.customerId");

    // Checkout: reserves stock, numbers the order, snapshots prices, is idempotent.
    const key = "chk-1";
    const placed = (
      await owner
        .post(`${base}/carts/${cart.id}/checkout`)
        .set("Idempotency-Key", key)
        .send({ shippingAddress: address, poNumber: "PO-77" })
        .expect(201)
    ).body.data;
    firstOrderId = placed.orderId;
    const replay = (
      await owner
        .post(`${base}/carts/${cart.id}/checkout`)
        .set("Idempotency-Key", key)
        .send({ shippingAddress: address, poNumber: "PO-77" })
        .expect(201)
    ).body.data;
    expect(replay.orderId).toBe(firstOrderId);
    const conflict = await owner
      .post(`${base}/carts/${cart.id}/checkout`)
      .set("Idempotency-Key", key)
      .send({ shippingAddress: address, poNumber: "PO-78" })
      .expect(409);
    expect(conflict.body.error.code).toBe("idempotency_conflict");
    await owner.post(`${base}/carts/${cart.id}/checkout`).send({}).expect(409);

    const order = (await owner.get(`${base}/orders/${firstOrderId}`).expect(200)).body.data;
    expect(order).toMatchObject({
      name: "#1001",
      status: "confirmed",
      paymentStatus: "pending",
      fulfillmentStatus: "unfulfilled",
      source: "storefront",
      poNumber: "PO-77",
      itemCount: 4,
      totals: { total: { amount: 32_000 } },
      shippingAddress: { city: "Ankara" },
      billingAddress: { city: "Ankara" },
    });
    expect(order.buyer.customer.id).toBe(buyerId);
    expect(order.items[0]).toMatchObject({
      sku: "BOLT-M6",
      unitPrice: { amount: 8_000 },
      priceSource: "price_list",
      reservations: [{ locationId, quantity: 4 }],
    });
    expect(order.events.map((e: { type: string }) => e.type)).toEqual(["order.created"]);
    const stock = (await owner.get(`${base}/inventory/items/${boltItemId}`).expect(200)).body.data;
    expect(stock).toMatchObject({ onHand: 10, reserved: 4, available: 6 });
    const cartAfter = (await owner.get(`${base}/carts/${cart.id}`).expect(200)).body.data;
    expect(cartAfter).toMatchObject({ status: "completed", completedOrderId: firstOrderId });
    const customer = (await owner.get(`${base}/customers/${buyerId}`).expect(200)).body.data;
    expect(customer).toMatchObject({ ordersCount: 1, totalSpent: { amount: 32_000 } });
  });

  it("refuses to oversell and rejects invisible or unsellable items", async () => {
    const tooMany = (
      await owner
        .post(`${base}/carts`)
        .send({ items: [{ variantId: boltM6, quantity: 8 }] })
        .expect(201)
    ).body.data;
    expect(tooMany.problems[0]).toMatch(/Only 6 available/);
    const refused = await owner.post(`${base}/carts/${tooMany.id}/checkout`).send({}).expect(400);
    expect(refused.body.error.fields[0].path).toBe(`items.${boltM6}`);

    const catalog = (
      await owner
        .post(`${base}/catalogs`)
        .send({ name: "Gloves only", status: "active", productIds: [] })
        .expect(201)
    ).body.data;
    await owner
      .post(`${base}/catalogs/${catalog.id}/assignments`)
      .send({ companyId: acmeId })
      .expect(201);
    const hidden = (
      await owner
        .post(`${base}/carts`)
        .send({ buyer: { companyId: acmeId }, items: [{ variantId: boltM6, quantity: 2 }] })
        .expect(201)
    ).body.data;
    expect(hidden.catalogRestricted).toBe(true);
    expect(hidden.items[0].visible).toBe(false);
    await owner.post(`${base}/carts/${hidden.id}/checkout`).send({}).expect(400);
    await owner.delete(`${base}/catalogs/${catalog.id}`).expect(204);
  });

  it("lists, filters, updates, annotates and cancels orders with stock released", async () => {
    const list = (await owner.get(`${base}/orders?open=true`).expect(200)).body.data;
    expect(list.map((o: { name: string }) => o.name)).toEqual(["#1001"]);
    expect((await owner.get(`${base}/orders?q=PO-77`).expect(200)).body.data).toHaveLength(1);
    expect((await owner.get(`${base}/orders?q=1001`).expect(200)).body.data).toHaveLength(1);
    expect((await owner.get(`${base}/orders?q=BOLT`).expect(200)).body.data).toHaveLength(1);
    expect(
      (await owner.get(`${base}/orders?companyId=${acmeId}`).expect(200)).body.data,
    ).toHaveLength(1);

    const order = (await owner.get(`${base}/orders/${firstOrderId}`)).body.data;
    await owner
      .patch(`${base}/orders/${firstOrderId}`)
      .send({ version: 99, note: "stale" })
      .expect(409);
    const updated = (
      await owner
        .patch(`${base}/orders/${firstOrderId}`)
        .send({ version: order.version, note: "Deliver to dock 3", tags: ["priority", "priority"] })
        .expect(200)
    ).body.data;
    expect(updated).toMatchObject({ note: "Deliver to dock 3", tags: ["priority"] });
    const noted = (
      await owner
        .post(`${base}/orders/${firstOrderId}/notes`)
        .send({ message: "Called the buyer" })
        .expect(200)
    ).body.data;
    expect(noted.events.at(-1)).toMatchObject({
      type: "order.note",
      payload: { message: "Called the buyer" },
      actor: { name: "Test User" },
    });

    const stats = (await owner.get(`${base}/orders/stats`).expect(200)).body.data;
    expect(stats).toMatchObject({
      openOrders: 1,
      awaitingPayment: 1,
      toFulfill: 1,
      ordersLast30Days: 1,
      grossSalesLast30Days: { amount: 32_000 },
      averageOrderValueLast30Days: { amount: 32_000 },
    });

    await owner.post(`${base}/orders/${firstOrderId}/cancel`).send({}).expect(400);
    const cancelled = (
      await owner
        .post(`${base}/orders/${firstOrderId}/cancel`)
        .send({ reason: "Customer changed their mind" })
        .expect(200)
    ).body.data;
    expect(cancelled).toMatchObject({
      status: "cancelled",
      cancelReason: "Customer changed their mind",
    });
    expect(cancelled.items[0].reservations).toEqual([]);
    await owner.post(`${base}/orders/${firstOrderId}/cancel`).send({ reason: "again" }).expect(409);
    const stock = (await owner.get(`${base}/inventory/items/${boltItemId}`).expect(200)).body.data;
    expect(stock).toMatchObject({ onHand: 10, reserved: 0, available: 10 });
    const customer = (await owner.get(`${base}/customers/${buyerId}`).expect(200)).body.data;
    expect(customer).toMatchObject({ ordersCount: 0, totalSpent: { amount: 0 } });
    expect((await owner.get(`${base}/orders?status=cancelled`).expect(200)).body.data).toHaveLength(
      1,
    );
    expect((await owner.get(`${base}/orders?open=true`).expect(200)).body.data).toHaveLength(0);
  });

  it("runs a draft order with a custom price through to a numbered order", async () => {
    const draft = (
      await owner
        .post(`${base}/draft-orders`)
        .send({
          buyer: { companyId: acmeId },
          items: [
            { variantId: boltM6, quantity: 2, customUnitPrice: 7_500 },
            { variantId: gloveL, quantity: 1 },
          ],
          shippingAddress: address,
          tags: ["phone"],
        })
        .expect(201)
    ).body.data;
    expect(draft.name).toBe("D1001");
    expect(draft.items[0]).toMatchObject({
      priceSource: "custom",
      unitPrice: { amount: 7_500 },
      customUnitPrice: { amount: 7_500 },
    });
    expect(draft.items[1]).toMatchObject({
      priceSource: "price_list",
      unitPrice: { amount: 4_000 },
    });
    expect(draft.totals.total.amount).toBe(19_000);
    expect(draft.ready).toBe(true);

    const edited = (
      await owner
        .patch(`${base}/draft-orders/${draft.id}`)
        .send({
          version: draft.version,
          items: [{ variantId: boltM6, quantity: 4, customUnitPrice: 7_500 }],
          poNumber: "PO-DRAFT",
        })
        .expect(200)
    ).body.data;
    expect(edited.items).toHaveLength(1);
    expect(edited.totals.total.amount).toBe(30_000);

    const completed = (
      await owner
        .post(`${base}/draft-orders/${draft.id}/complete`)
        .set("Idempotency-Key", "draft-1")
        .expect(201)
    ).body.data;
    const again = (
      await owner
        .post(`${base}/draft-orders/${draft.id}/complete`)
        .set("Idempotency-Key", "draft-1")
        .expect(201)
    ).body.data;
    expect(again.orderId).toBe(completed.orderId);
    await owner.post(`${base}/draft-orders/${draft.id}/complete`).expect(409);

    const order = (await owner.get(`${base}/orders/${completed.orderId}`).expect(200)).body.data;
    expect(order).toMatchObject({
      name: "#1002",
      source: "draft_order",
      draftOrderId: draft.id,
      poNumber: "PO-DRAFT",
      tags: ["phone"],
      totals: { total: { amount: 30_000 } },
    });
    expect(order.items[0]).toMatchObject({ priceSource: "custom", unitPrice: { amount: 7_500 } });
    const draftAfter = (await owner.get(`${base}/draft-orders/${draft.id}`).expect(200)).body.data;
    expect(draftAfter).toMatchObject({ status: "completed", completedOrderId: completed.orderId });
    await owner
      .patch(`${base}/draft-orders/${draft.id}`)
      .send({ version: draftAfter.version, note: "x" })
      .expect(409);

    const open = (await owner.get(`${base}/draft-orders?status=open`).expect(200)).body.data;
    expect(open).toHaveLength(0);
    const other = (
      await owner
        .post(`${base}/draft-orders`)
        .send({ items: [{ variantId: gloveL, quantity: 1 }] })
        .expect(201)
    ).body.data;
    const cancelledDraft = (await owner.post(`${base}/draft-orders/${other.id}/cancel`).expect(200))
      .body.data;
    expect(cancelledDraft.status).toBe("cancelled");
  });

  it("gates writes and hides commerce data across tenants", async () => {
    const viewerEmail = uniqueEmail("viewer");
    await owner
      .post(`${base}/invitations`)
      .send({ email: viewerEmail, role: "viewer" })
      .expect(201);
    const token = linkToken(t.mail.lastTo(viewerEmail)?.text, "invitations");
    const viewer = t.http();
    await signupVerified(t, viewer, viewerEmail);
    await viewer.post("/admin/v1/invitations/accept").send({ token }).expect(200);
    await viewer.get(`${base}/orders`).expect(200);
    await viewer.get(`${base}/orders/${firstOrderId}`).expect(200);
    const forbidden = await viewer.post(`${base}/carts`).send({ items: [] }).expect(403);
    expect(forbidden.body.error.missing).toEqual(["orders.write"]);
    await viewer.post(`${base}/orders/${firstOrderId}/cancel`).send({ reason: "no" }).expect(403);

    const stranger = t.http();
    await signupVerified(t, stranger);
    const other = await createOrgAndStore(stranger, "Other Co");
    const otherBase = `/admin/v1/stores/${other.storeId}`;
    await stranger.get(`${base}/orders`).expect(404);
    await stranger.get(`${otherBase}/orders/${firstOrderId}`).expect(404);
    await stranger
      .post(`${otherBase}/orders/${firstOrderId}/cancel`)
      .send({ reason: "x" })
      .expect(404);
    expect((await stranger.get(`${otherBase}/orders`).expect(200)).body.data).toHaveLength(0);
    const foreignVariant = await stranger
      .post(`${otherBase}/carts`)
      .send({ items: [{ variantId: boltM6, quantity: 1 }] })
      .expect(400);
    expect(foreignVariant.body.error.fields[0].path).toBe("items");
    await stranger
      .post(`${otherBase}/draft-orders`)
      .send({ buyer: { companyId: acmeId }, items: [] })
      .expect(400);
  });
});
