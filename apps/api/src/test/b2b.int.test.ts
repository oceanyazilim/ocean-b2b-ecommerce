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

describe.skipIf(!INTEGRATION_ENABLED)("phase 12: quotes, credit, approvals, finance, discounts, saved lists", () => {
  let t: TestApp;
  let owner: ReturnType<TestApp["http"]>;
  let storeId: string;
  let base: string;
  let boltM6: string;
  let companyId: string;
  let buyerId: string;

  beforeAll(async () => {
    await assertInfraReachable();
    t = await createTestApp();
    owner = t.http();
    await signupVerified(t, owner);
    ({ storeId } = await createOrgAndStore(owner, "B2B Advanced Co"));
    base = `/admin/v1/stores/${storeId}`;

    boltM6 = (
      await owner
        .post(`${base}/products`)
        .send({ title: "Steel Bolt", status: "active", variants: [{ sku: "BOLT-M6", price: 10_000 }] })
        .expect(201)
    ).body.data.variants[0].id;
    const locationId = (await owner.post(`${base}/locations`).send({ name: "Main" }).expect(201)).body
      .data.id;
    const itemId = (
      await owner.post(`${base}/inventory/items`).send({ productVariantId: boltM6 }).expect(201)
    ).body.data.id;
    await owner
      .post(`${base}/inventory/adjustments`)
      .send({ itemId, locationId, delta: 100 })
      .expect(201);

    const company = (
      await owner.post(`${base}/companies`).send({ legalName: "Beta Wholesale Ltd" }).expect(201)
    ).body.data;
    companyId = company.id;
    buyerId = (
      await owner
        .post(`${base}/companies/${companyId}/users`)
        .send({ email: uniqueEmail("buyer"), firstName: "Buyer", role: "buyer" })
        .expect(201)
    ).body.data.customer.id;
  });
  afterAll(async () => {
    await t?.close();
  });

  it("runs a quote through send -> accept -> convert into a real order", async () => {
    const quote = (
      await owner
        .post(`${base}/quotes`)
        .send({
          companyId,
          customerId: buyerId,
          currency: "TRY",
          items: [{ variantId: boltM6, quantity: 3, unitPrice: 7_500 }],
        })
        .expect(201)
    ).body.data;
    expect(quote.status).toBe("draft");
    expect(quote.number).toMatch(/^QT-/);
    expect(quote.total).toMatchObject({ amount: 22_500 });

    await owner.post(`${base}/quotes/${quote.id}/convert`).expect(409);

    await owner.post(`${base}/quotes/${quote.id}/send`).expect(200);
    await owner.post(`${base}/quotes/${quote.id}/accept`).expect(200);
    const converted = (
      await owner.post(`${base}/quotes/${quote.id}/convert`).expect(201)
    ).body.data;

    const order = (await owner.get(`${base}/orders/${converted.orderId}`).expect(200)).body.data;
    expect(order).toMatchObject({ source: "quote", totals: { total: { amount: 22_500 } } });
    expect(order.items[0]).toMatchObject({ priceSource: "custom", unitPrice: { amount: 7_500 } });

    const quoteAfter = (await owner.get(`${base}/quotes/${quote.id}`).expect(200)).body.data;
    expect(quoteAfter).toMatchObject({ status: "converted", convertedOrderId: converted.orderId });
  });

  it("blocks a decline after conversion and rejects editing a sent quote", async () => {
    const quote = (
      await owner
        .post(`${base}/quotes`)
        .send({ companyId, customerId: buyerId, currency: "TRY", items: [] })
        .expect(201)
    ).body.data;
    await owner.post(`${base}/quotes/${quote.id}/send`).expect(200);
    await owner.patch(`${base}/quotes/${quote.id}`).send({ notes: "too late" }).expect(409);
    const declined = (
      await owner.post(`${base}/quotes/${quote.id}/decline`).send({ reason: "Buyer went elsewhere" }).expect(200)
    ).body.data;
    expect(declined.status).toBe("declined");
    await owner.post(`${base}/quotes/${quote.id}/accept`).expect(409);
  });

  it("tracks a credit account balance through the ledger and enforces the limit", async () => {
    const account = (
      await owner
        .post(`${base}/credit-accounts`)
        .send({ companyId, limit: 50_000, currency: "TRY", onExceedPolicy: "reject" })
        .expect(201)
    ).body.data;
    expect(account).toMatchObject({ limit: { amount: 50_000 }, used: { amount: 0 }, available: { amount: 50_000 } });

    const charged = (
      await owner.post(`${base}/credit-accounts/${account.id}/adjust`).send({ delta: 30_000 }).expect(201)
    ).body.data;
    expect(charged.used).toMatchObject({ amount: 30_000 });
    expect(charged.ledger).toHaveLength(1);

    const overLimit = await owner
      .post(`${base}/credit-accounts/${account.id}/adjust`)
      .send({ delta: 30_000 })
      .expect(409);
    expect(overLimit.body.error.code).toBe("conflict");

    const paidDown = (
      await owner.post(`${base}/credit-accounts/${account.id}/adjust`).send({ delta: -10_000 }).expect(201)
    ).body.data;
    expect(paidDown.used).toMatchObject({ amount: 20_000 });
  });

  it("gates an order above the approval threshold, then approving confirms it", async () => {
    await owner
      .post(`${base}/approval-rules`)
      .send({ companyId, conditions: { minTotal: 50_000 }, approverRoles: ["admin"] })
      .expect(201);

    const cart = (
      await owner
        .post(`${base}/carts`)
        .send({ buyer: { customerId: buyerId, companyId }, items: [{ variantId: boltM6, quantity: 10 }] })
        .expect(201)
    ).body.data;
    const placed = (await owner.post(`${base}/carts/${cart.id}/checkout`).send({}).expect(201)).body.data;
    const order = (await owner.get(`${base}/orders/${placed.orderId}`).expect(200)).body.data;
    expect(order.status).toBe("pending_approval");

    const pending = (await owner.get(`${base}/approvals?status=pending`).expect(200)).body.data;
    const approval = pending.find((a: { orderId: string }) => a.orderId === placed.orderId);
    expect(approval).toBeDefined();

    const approved = (
      await owner.post(`${base}/approvals/${approval.id}/approve`).send({}).expect(201)
    ).body.data;
    expect(approved.status).toBe("approved");
    const orderAfter = (await owner.get(`${base}/orders/${placed.orderId}`).expect(200)).body.data;
    expect(orderAfter.status).toBe("confirmed");
  });

  it("cancels the order and releases stock when an approval is rejected", async () => {
    const before = (
      await owner
        .get(`${base}/inventory/items`)
        .query({ q: "BOLT-M6" })
        .expect(200)
    ).body.data[0];

    const cart = (
      await owner
        .post(`${base}/carts`)
        .send({ buyer: { customerId: buyerId, companyId }, items: [{ variantId: boltM6, quantity: 8 }] })
        .expect(201)
    ).body.data;
    const placed = (await owner.post(`${base}/carts/${cart.id}/checkout`).send({}).expect(201)).body.data;
    const pending = (await owner.get(`${base}/approvals?status=pending`).expect(200)).body.data;
    const approval = pending.find((a: { orderId: string }) => a.orderId === placed.orderId);

    await owner.post(`${base}/approvals/${approval.id}/reject`).send({ note: "Over budget" }).expect(201);
    const order = (await owner.get(`${base}/orders/${placed.orderId}`).expect(200)).body.data;
    expect(order.status).toBe("cancelled");

    const after = (
      await owner.get(`${base}/inventory/items`).query({ q: "BOLT-M6" }).expect(200)
    ).body.data[0];
    expect(after.available).toBe(before.available);
  });

  it("invoices an order and records a payment against it", async () => {
    const method = (
      await owner.post(`${base}/payment-methods`).send({ provider: "test", name: "Test" }).expect(201)
    ).body.data;
    const cart = (
      await owner
        .post(`${base}/carts`)
        .send({ items: [{ variantId: boltM6, quantity: 1 }] })
        .expect(201)
    ).body.data;
    await owner.patch(`${base}/carts/${cart.id}`).send({ paymentMethodId: method.id }).expect(200);
    const placed = (await owner.post(`${base}/carts/${cart.id}/checkout`).send({}).expect(201)).body.data;
    const withCompany = await owner
      .post(`${base}/invoices`)
      .send({ orderId: placed.orderId, dueAt: new Date(Date.now() + 86_400_000).toISOString() })
      .expect(400);
    expect(withCompany.body.error.fields[0].path).toBe("orderId");

    const cart2 = (
      await owner
        .post(`${base}/carts`)
        .send({ buyer: { customerId: buyerId, companyId }, items: [{ variantId: boltM6, quantity: 1 }] })
        .expect(201)
    ).body.data;
    await owner.patch(`${base}/carts/${cart2.id}`).send({ paymentMethodId: method.id }).expect(200);
    const placed2 = (await owner.post(`${base}/carts/${cart2.id}/checkout`).send({}).expect(201)).body.data;
    const invoice = (
      await owner
        .post(`${base}/invoices`)
        .send({ orderId: placed2.orderId, dueAt: new Date(Date.now() + 86_400_000).toISOString() })
        .expect(201)
    ).body.data;
    expect(invoice).toMatchObject({ status: "pending", amount: { amount: 10_000 }, balance: { amount: 10_000 } });

    const orderPayment = (await owner.get(`${base}/orders/${placed2.orderId}`).expect(200)).body.data;
    const paymentId = orderPayment.payments[0].id;
    const paidInvoice = (
      await owner
        .post(`${base}/invoices/${invoice.id}/payments`)
        .send({ paymentId, amount: 10_000 })
        .expect(201)
    ).body.data;
    expect(paidInvoice).toMatchObject({ status: "paid", paidAmount: { amount: 10_000 }, balance: { amount: 0 } });
  });

  it("validates a discount code by subtotal, dates and usage limit", async () => {
    await owner
      .post(`${base}/discounts`)
      .send({
        type: "percentage",
        method: "code",
        value: { percent: 10 },
        conditions: { minSubtotal: 5_000 },
        startsAt: new Date(Date.now() - 1000).toISOString(),
        code: "SAVE10",
      })
      .expect(201);

    const tooLow = (
      await owner.post(`${base}/discounts/validate-code`).send({ code: "SAVE10", subtotal: 1_000 }).expect(200)
    ).body.data;
    expect(tooLow.valid).toBeNull();

    const ok = (
      await owner.post(`${base}/discounts/validate-code`).send({ code: "save10", subtotal: 10_000 }).expect(200)
    ).body.data;
    expect(ok.valid).toMatchObject({ amount: { amount: 1_000 } });

    const unknown = (
      await owner.post(`${base}/discounts/validate-code`).send({ code: "NOPE", subtotal: 10_000 }).expect(200)
    ).body.data;
    expect(unknown.valid).toBeNull();
  });

  it("builds a saved list and adds every line to a cart in one call", async () => {
    const list = (
      await owner
        .post(`${base}/saved-lists`)
        .send({ name: "Monthly restock", companyId, items: [{ variantId: boltM6, quantity: 5 }] })
        .expect(201)
    ).body.data;
    expect(list.itemCount).toBe(1);

    const cart = (
      await owner
        .post(`${base}/carts`)
        .send({ buyer: { customerId: buyerId, companyId }, items: [] })
        .expect(201)
    ).body.data;
    const withItems = (
      await owner.post(`${base}/saved-lists/${list.id}/add-to-cart`).send({ cartId: cart.id }).expect(201)
    ).body.data;
    expect(withItems.items).toHaveLength(1);
    expect(withItems.items[0]).toMatchObject({ variantId: boltM6, quantity: 5 });
  });

  it("gates the new endpoints behind their permissions and tenant isolation", async () => {
    const viewerEmail = uniqueEmail("viewer");
    await owner.post(`${base}/invitations`).send({ email: viewerEmail, role: "viewer" }).expect(201);
    const inviteToken = linkToken(t.mail.lastTo(viewerEmail)?.text, "invitations");
    const viewer = t.http();
    await signupVerified(t, viewer, viewerEmail);
    await viewer.post("/admin/v1/invitations/accept").send({ token: inviteToken }).expect(200);

    const forbidden = await viewer.post(`${base}/quotes`).send({}).expect(403);
    expect(forbidden.body.error.missing).toEqual(["quotes.write"]);

    const stranger = t.http();
    await signupVerified(t, stranger);
    const other = await createOrgAndStore(stranger, "Other Co");
    const otherBase = `/admin/v1/stores/${other.storeId}`;
    expect((await stranger.get(`${otherBase}/quotes`).expect(200)).body.data).toEqual([]);
    expect((await stranger.get(`${otherBase}/credit-accounts`).expect(200)).body.data).toEqual([]);
    expect((await stranger.get(`${otherBase}/saved-lists`).expect(200)).body.data).toEqual([]);
    await stranger.get(`${base}/quotes`).expect(404);
  });
});
