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

const trAddress = { address1: "Sanayi Cd. 5", city: "Ankara", countryCode: "TR" };
const frAddress = { address1: "Rue de Paris 1", city: "Paris", countryCode: "FR" };

describe.skipIf(!INTEGRATION_ENABLED)("phase 7: shipping, tax, payments, fulfillment, returns", () => {
  let t: TestApp;
  let owner: ReturnType<TestApp["http"]>;
  let storeId: string;
  let base: string;
  let boltM6: string;
  let locationId: string;
  let boltItemId: string;
  let zoneId: string;
  let cheapRateId: string;
  let pricyRateId: string;
  let testMethodId: string;
  let manualMethodId: string;

  beforeAll(async () => {
    await assertInfraReachable();
    t = await createTestApp();
    owner = t.http();
    await signupVerified(t, owner);
    ({ storeId } = await createOrgAndStore(owner, "Fulfilment Co"));
    base = `/admin/v1/stores/${storeId}`;

    const bolt = (
      await owner
        .post(`${base}/products`)
        .send({
          title: "Steel Bolt",
          status: "active",
          variants: [{ sku: "BOLT-M6", price: 10_000, weight: 0.2, weightUnit: "kg" }],
        })
        .expect(201)
    ).body.data;
    boltM6 = bolt.variants[0].id;
    locationId = (await owner.post(`${base}/locations`).send({ name: "Main" }).expect(201)).body.data.id;
    boltItemId = (
      await owner.post(`${base}/inventory/items`).send({ productVariantId: boltM6 }).expect(201)
    ).body.data.id;
    await owner
      .post(`${base}/inventory/adjustments`)
      .send({ itemId: boltItemId, locationId, delta: 20 })
      .expect(201);

    const zone = (
      await owner
        .post(`${base}/shipping/zones`)
        .send({ name: "Turkey", countries: ["TR"] })
        .expect(201)
    ).body.data;
    zoneId = zone.id;
    cheapRateId = (
      await owner
        .post(`${base}/shipping/zones/${zoneId}/rates`)
        .send({ name: "Standard", type: "flat", price: 1_500 })
        .expect(201)
    ).body.data.id;
    pricyRateId = (
      await owner
        .post(`${base}/shipping/zones/${zoneId}/rates`)
        .send({ name: "Express", type: "flat", price: 4_000 })
        .expect(201)
    ).body.data.id;

    await owner
      .post(`${base}/tax/rules`)
      .send({ name: "Turkey VAT", countryCode: "TR", rateBps: 1800 })
      .expect(201);

    testMethodId = (
      await owner
        .post(`${base}/payment-methods`)
        .send({ provider: "test", name: "Test Card" })
        .expect(201)
    ).body.data.id;
    manualMethodId = (
      await owner
        .post(`${base}/payment-methods`)
        .send({ provider: "manual", name: "Bank Transfer" })
        .expect(201)
    ).body.data.id;
  });
  afterAll(async () => {
    await t?.close();
  });

  it("prices a cart with shipping and tax, and lets the buyer pick a rate", async () => {
    const cart = (
      await owner
        .post(`${base}/carts`)
        .send({ items: [{ variantId: boltM6, quantity: 2 }] })
        .expect(201)
    ).body.data;
    const priced = (
      await owner
        .patch(`${base}/carts/${cart.id}`)
        .send({ shippingAddress: trAddress })
        .expect(200)
    ).body.data;
    expect(priced.availableShippingRates.map((r: { id: string }) => r.id).sort()).toEqual(
      [cheapRateId, pricyRateId].sort(),
    );
    // Cheapest rate wins by default.
    expect(priced.totals).toMatchObject({
      subtotal: { amount: 20_000 },
      shippingTotal: { amount: 1_500 },
      taxTotal: { amount: 3_600 },
      total: { amount: 25_100 },
    });
    expect(priced.shippingRate).toBeNull();

    const withExpress = (
      await owner.patch(`${base}/carts/${cart.id}`).send({ shippingRateId: pricyRateId }).expect(200)
    ).body.data;
    expect(withExpress.shippingRate).toMatchObject({ id: pricyRateId, name: "Express" });
    expect(withExpress.totals.shippingTotal).toMatchObject({ amount: 4_000 });

    await owner.patch(`${base}/carts/${cart.id}`).send({ paymentMethodId: testMethodId }).expect(200);
    const placed = (await owner.post(`${base}/carts/${cart.id}/checkout`).send({}).expect(201)).body.data;
    const order = (await owner.get(`${base}/orders/${placed.orderId}`).expect(200)).body.data;
    expect(order.totals).toMatchObject({
      subtotal: { amount: 20_000 },
      shippingTotal: { amount: 4_000 },
      taxTotal: { amount: 3_600 },
      total: { amount: 27_600 },
    });
    expect(order.paymentStatus).toBe("paid");
    expect(order.payments).toHaveLength(1);
    expect(order.payments[0]).toMatchObject({
      provider: "test",
      status: "captured",
      amount: { amount: 27_600 },
    });
  });

  it("falls back to no shipping rate outside any zone and skips tax with no matching rule", async () => {
    const cart = (
      await owner
        .post(`${base}/carts`)
        .send({ items: [{ variantId: boltM6, quantity: 1 }] })
        .expect(201)
    ).body.data;
    const priced = (
      await owner
        .patch(`${base}/carts/${cart.id}`)
        .send({ shippingAddress: frAddress })
        .expect(200)
    ).body.data;
    expect(priced.availableShippingRates).toEqual([]);
    expect(priced.totals).toMatchObject({
      shippingTotal: { amount: 0 },
      taxTotal: { amount: 0 },
      total: { amount: 10_000 },
    });
  });

  it("charges with the manual adapter as pending, then lets staff confirm it", async () => {
    const cart = (
      await owner
        .post(`${base}/carts`)
        .send({ items: [{ variantId: boltM6, quantity: 1 }] })
        .expect(201)
    ).body.data;
    await owner
      .patch(`${base}/carts/${cart.id}`)
      .send({ shippingAddress: trAddress, paymentMethodId: manualMethodId })
      .expect(200);
    const placed = (await owner.post(`${base}/carts/${cart.id}/checkout`).send({}).expect(201)).body.data;
    let order = (await owner.get(`${base}/orders/${placed.orderId}`).expect(200)).body.data;
    expect(order.paymentStatus).toBe("pending");
    expect(order.payments[0].status).toBe("pending");

    const paymentId = order.payments[0].id;
    await owner
      .post(`${base}/orders/${placed.orderId}/payments/${paymentId}/confirm`)
      .send({})
      .expect(200);
    order = (await owner.get(`${base}/orders/${placed.orderId}`).expect(200)).body.data;
    expect(order.paymentStatus).toBe("paid");
    expect(order.payments[0].status).toBe("captured");
  });

  it("fulfils part of an order, ships, delivers, and moves inventory", async () => {
    const cart = (
      await owner
        .post(`${base}/carts`)
        .send({ items: [{ variantId: boltM6, quantity: 5 }] })
        .expect(201)
    ).body.data;
    await owner.patch(`${base}/carts/${cart.id}`).send({ shippingAddress: trAddress }).expect(200);
    const placed = (await owner.post(`${base}/carts/${cart.id}/checkout`).send({}).expect(201)).body.data;
    const order = (await owner.get(`${base}/orders/${placed.orderId}`).expect(200)).body.data;
    const orderItemId = order.items[0].id;

    const before = (await owner.get(`${base}/inventory/items/${boltItemId}`).expect(200)).body.data;

    const partial = (
      await owner
        .post(`${base}/orders/${placed.orderId}/fulfillments`)
        .send({ locationId, items: [{ orderItemId, quantity: 2 }] })
        .expect(201)
    ).body.data;
    expect(partial.status).toBe("pending");
    let orderAfter = (await owner.get(`${base}/orders/${placed.orderId}`).expect(200)).body.data;
    expect(orderAfter.fulfillmentStatus).toBe("partially_fulfilled");
    expect(orderAfter.items[0]).toMatchObject({ fulfilledQuantity: 2 });

    const afterPartial = (await owner.get(`${base}/inventory/items/${boltItemId}`).expect(200)).body.data;
    expect(afterPartial.onHand).toBe(before.onHand - 2);
    expect(afterPartial.reserved).toBe(before.reserved - 2);

    await owner.post(`${base}/orders/${placed.orderId}/fulfillments/${partial.id}/ship`).send({}).expect(200);
    const shipped = (
      await owner.post(`${base}/orders/${placed.orderId}/fulfillments/${partial.id}/deliver`).send({}).expect(200)
    ).body.data;
    expect(shipped.status).toBe("delivered");

    const rest = (
      await owner
        .post(`${base}/orders/${placed.orderId}/fulfillments`)
        .send({ locationId, items: [{ orderItemId, quantity: 3 }], trackingNumber: "TRK-1" })
        .expect(201)
    ).body.data;
    expect(rest.status).toBe("shipped");
    orderAfter = (await owner.get(`${base}/orders/${placed.orderId}`).expect(200)).body.data;
    expect(orderAfter.fulfillmentStatus).toBe("fulfilled");

    const overFulfil = await owner
      .post(`${base}/orders/${placed.orderId}/fulfillments`)
      .send({ locationId, items: [{ orderItemId, quantity: 1 }] })
      .expect(400);
    expect(overFulfil.body.error.fields[0].path).toBe(`items.${orderItemId}`);
  });

  it("cancels a pending fulfilment and restocks it", async () => {
    const cart = (
      await owner
        .post(`${base}/carts`)
        .send({ items: [{ variantId: boltM6, quantity: 1 }] })
        .expect(201)
    ).body.data;
    await owner.patch(`${base}/carts/${cart.id}`).send({ shippingAddress: trAddress }).expect(200);
    const placed = (await owner.post(`${base}/carts/${cart.id}/checkout`).send({}).expect(201)).body.data;
    const order = (await owner.get(`${base}/orders/${placed.orderId}`).expect(200)).body.data;
    const orderItemId = order.items[0].id;
    const before = (await owner.get(`${base}/inventory/items/${boltItemId}`).expect(200)).body.data;

    const fulfillment = (
      await owner
        .post(`${base}/orders/${placed.orderId}/fulfillments`)
        .send({ locationId, items: [{ orderItemId, quantity: 1 }] })
        .expect(201)
    ).body.data;
    await owner
      .post(`${base}/orders/${placed.orderId}/fulfillments/${fulfillment.id}/cancel`)
      .send({ restock: true })
      .expect(200);
    const orderAfter = (await owner.get(`${base}/orders/${placed.orderId}`).expect(200)).body.data;
    expect(orderAfter.fulfillmentStatus).toBe("unfulfilled");
    expect(orderAfter.items[0].fulfilledQuantity).toBe(0);
    const after = (await owner.get(`${base}/inventory/items/${boltItemId}`).expect(200)).body.data;
    expect(after.onHand).toBe(before.onHand);
    expect(after.reserved).toBe(before.reserved);
  });

  it("runs a return through to a refund and restocks it", async () => {
    const cart = (
      await owner
        .post(`${base}/carts`)
        .send({ items: [{ variantId: boltM6, quantity: 2 }] })
        .expect(201)
    ).body.data;
    await owner
      .patch(`${base}/carts/${cart.id}`)
      .send({ shippingAddress: trAddress, paymentMethodId: testMethodId })
      .expect(200);
    const placed = (await owner.post(`${base}/carts/${cart.id}/checkout`).send({}).expect(201)).body.data;
    const order = (await owner.get(`${base}/orders/${placed.orderId}`).expect(200)).body.data;
    const orderItemId = order.items[0].id;

    await owner
      .post(`${base}/orders/${placed.orderId}/fulfillments`)
      .send({ locationId, items: [{ orderItemId, quantity: 2 }], trackingNumber: "TRK-9" })
      .expect(201);
    const before = (await owner.get(`${base}/inventory/items/${boltItemId}`).expect(200)).body.data;

    const ret = (
      await owner
        .post(`${base}/orders/${placed.orderId}/returns`)
        .send({
          reason: "Wrong size",
          resolution: "refund",
          items: [{ orderItemId, quantity: 1, restock: true }],
        })
        .expect(201)
    ).body.data;
    expect(ret.status).toBe("requested");
    await owner.post(`${base}/orders/${placed.orderId}/returns/${ret.id}/approve`).send({}).expect(200);
    await owner
      .post(`${base}/orders/${placed.orderId}/returns/${ret.id}/receive`)
      .send({ locationId })
      .expect(200);
    const afterReceive = (await owner.get(`${base}/inventory/items/${boltItemId}`).expect(200)).body.data;
    expect(afterReceive.onHand).toBe(before.onHand + 1);

    const closed = (
      await owner.post(`${base}/orders/${placed.orderId}/returns/${ret.id}/close`).send({}).expect(200)
    ).body.data;
    expect(closed.status).toBe("closed");
    expect(closed.refundId).toBeTruthy();

    const orderAfter = (await owner.get(`${base}/orders/${placed.orderId}`).expect(200)).body.data;
    expect(orderAfter.paymentStatus).toBe("partially_refunded");
    expect(orderAfter.items[0].refundedQuantity).toBe(1);
    expect(orderAfter.refunds).toHaveLength(1);
    expect(orderAfter.refunds[0]).toMatchObject({ status: "succeeded", amount: { amount: 10_000 } });
  });

  it("gates the new endpoints behind their permissions and tenant isolation", async () => {
    const viewerEmail = uniqueEmail("viewer");
    await owner.post(`${base}/invitations`).send({ email: viewerEmail, role: "viewer" }).expect(201);
    const inviteToken = linkToken(t.mail.lastTo(viewerEmail)?.text, "invitations");
    const viewer = t.http();
    await signupVerified(t, viewer, viewerEmail);
    await viewer.post("/admin/v1/invitations/accept").send({ token: inviteToken }).expect(200);

    await viewer.get(`${base}/shipping/zones`).expect(200);
    const forbidden = await viewer
      .post(`${base}/shipping/zones`)
      .send({ name: "Nope", countries: ["TR"] })
      .expect(403);
    expect(forbidden.body.error.missing).toEqual(["shipping.write"]);
    await viewer.post(`${base}/tax/rules`).send({ name: "x", countryCode: "TR", rateBps: 100 }).expect(403);
    await viewer.post(`${base}/payment-methods`).send({ provider: "test", name: "x" }).expect(403);

    const stranger = t.http();
    await signupVerified(t, stranger);
    const other = await createOrgAndStore(stranger, "Other Co");
    const otherBase = `/admin/v1/stores/${other.storeId}`;
    await stranger.get(`${base}/shipping/zones`).expect(404);
    expect((await stranger.get(`${otherBase}/shipping/zones`).expect(200)).body.data).toEqual([]);
    expect((await stranger.get(`${otherBase}/payment-methods`).expect(200)).body.data).toEqual([]);
  });
});
