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

describe.skipIf(!INTEGRATION_ENABLED)("inventory: locations, items, movements, transfers", () => {
  let t: TestApp;
  let owner: ReturnType<TestApp["http"]>;
  let storeId: string;
  let base: string;
  let mainId: string;
  let depotId: string;
  let variantA: { id: string; sku: string };
  let itemA: string;
  let bareItem: string;

  beforeAll(async () => {
    await assertInfraReachable();
    t = await createTestApp();
    owner = t.http();
    await signupVerified(t, owner);
    ({ storeId } = await createOrgAndStore(owner, "Inventory Co"));
    base = `/admin/v1/stores/${storeId}`;
    const product = (
      await owner
        .post(`${base}/products`)
        .send({
          title: "Steel Bolt",
          status: "active",
          options: [{ name: "Size", values: ["M6", "M8"] }],
          variants: [
            { optionValues: ["M6"], sku: "BOLT-M6", price: 100 },
            { optionValues: ["M8"], sku: "BOLT-M8", price: 120 },
          ],
        })
        .expect(201)
    ).body.data;
    variantA = product.variants[0];
  });
  afterAll(async () => {
    await t?.close();
  });

  it("makes the first location the default and keeps exactly one default", async () => {
    const main = (
      await owner.post(`${base}/locations`).send({ name: "Main Warehouse" }).expect(201)
    ).body.data;
    expect(main.isDefault).toBe(true);
    mainId = main.id;

    const depot = (
      await owner.post(`${base}/locations`).send({ name: "Depot", type: "storage" }).expect(201)
    ).body.data;
    expect(depot.isDefault).toBe(false);
    depotId = depot.id;

    await owner.post(`${base}/locations`).send({ name: "Depot" }).expect(409);
    const noDeactivate = await owner
      .patch(`${base}/locations/${mainId}`)
      .send({ isActive: false })
      .expect(400);
    expect(noDeactivate.body.error.fields[0].path).toBe("isActive");

    await owner.post(`${base}/locations/${depotId}/default`).expect(200);
    const list = (await owner.get(`${base}/locations`).expect(200)).body.data;
    expect(list.filter((l: { isDefault: boolean }) => l.isDefault)).toHaveLength(1);
    expect(list[0].id).toBe(depotId);
    await owner.post(`${base}/locations/${mainId}/default`).expect(200);
  });

  it("tracks items by variant (inheriting the sku) or by bare sku, once each", async () => {
    const item = (
      await owner
        .post(`${base}/inventory/items`)
        .send({ productVariantId: variantA.id })
        .expect(201)
    ).body.data;
    expect(item.trackingType).toBe("variant");
    expect(item.sku).toBe("BOLT-M6");
    expect(item.variant.productTitle).toBe("Steel Bolt");
    expect(item.available).toBe(0);
    expect(item.stockStatus).toBe("out_of_stock");
    expect(item.levels.map((l: { locationName: string }) => l.locationName)).toEqual([
      "Main Warehouse",
      "Depot",
    ]);
    itemA = item.id;

    await owner.post(`${base}/inventory/items`).send({ productVariantId: variantA.id }).expect(409);
    await owner.post(`${base}/inventory/items`).send({ sku: "BOLT-M6" }).expect(409);
    await owner.post(`${base}/inventory/items`).send({}).expect(400);

    const bare = (
      await owner.post(`${base}/inventory/items`).send({ sku: "PALLET-EU" }).expect(201)
    ).body.data;
    expect(bare.trackingType).toBe("sku");
    expect(bare.variant).toBeNull();
    bareItem = bare.id;

    const candidates = (await owner.get(`${base}/inventory/variants?q=bolt`).expect(200)).body.data;
    expect(candidates).toHaveLength(2);
    expect(candidates.find((c: { sku: string }) => c.sku === "BOLT-M6").tracked).toBe(true);
    expect(candidates.find((c: { sku: string }) => c.sku === "BOLT-M8").tracked).toBe(false);
  });

  it("adjusts stock, refuses to go negative and records every movement", async () => {
    const plus = (
      await owner
        .post(`${base}/inventory/adjustments`)
        .send({ itemId: itemA, locationId: mainId, delta: 10, reference: "PO-1" })
        .expect(201)
    ).body.data;
    expect(plus.onHand).toBe(10);
    expect(plus.available).toBe(10);
    expect(plus.stockStatus).toBe("in_stock");
    expect(plus.levels.find((l: { locationId: string }) => l.locationId === mainId).quantity).toBe(
      10,
    );

    const tooMany = await owner
      .post(`${base}/inventory/adjustments`)
      .send({ itemId: itemA, locationId: mainId, delta: -15 })
      .expect(400);
    expect(tooMany.body.error.message).toMatch(/Only 10 sellable units/);

    const counted = (
      await owner
        .post(`${base}/inventory/adjustments`)
        .send({ itemId: itemA, locationId: mainId, quantity: 7, reason: "count" })
        .expect(201)
    ).body.data;
    expect(counted.onHand).toBe(7);

    await owner
      .post(`${base}/inventory/adjustments`)
      .send({ itemId: itemA, locationId: mainId, delta: 0 })
      .expect(400);
    await owner
      .post(`${base}/inventory/adjustments`)
      .send({ itemId: itemA, locationId: mainId, delta: 1, quantity: 1 })
      .expect(400);

    const movements = (await owner.get(`${base}/inventory/movements?itemId=${itemA}`).expect(200))
      .body.data;
    expect(movements).toHaveLength(2);
    expect(movements[0]).toMatchObject({
      reason: "count",
      quantity: 3,
      fromLocation: { id: mainId },
      toLocation: null,
    });
    expect(movements[1]).toMatchObject({
      reason: "adjustment",
      quantity: 10,
      reference: "PO-1",
      fromLocation: null,
      toLocation: { id: mainId },
    });
    expect(movements[1].actor.name).toBe("Test User");
  });

  it("keeps damaged units on hand but out of the sellable pool", async () => {
    const damaged = (
      await owner
        .post(`${base}/inventory/adjustments`)
        .send({ itemId: itemA, locationId: mainId, delta: 2, reason: "damage" })
        .expect(201)
    ).body.data;
    expect(damaged).toMatchObject({ onHand: 7, damaged: 2, available: 5, stockStatus: "low" });

    const overRestore = await owner
      .post(`${base}/inventory/adjustments`)
      .send({ itemId: itemA, locationId: mainId, delta: -3, reason: "damage" })
      .expect(400);
    expect(overRestore.body.error.message).toMatch(/Only 2 damaged/);

    const restored = (
      await owner
        .post(`${base}/inventory/adjustments`)
        .send({ itemId: itemA, locationId: mainId, delta: -1, reason: "damage" })
        .expect(201)
    ).body.data;
    expect(restored).toMatchObject({ onHand: 7, damaged: 1, available: 6 });
  });

  it("transfers atomically between locations within sellable stock", async () => {
    const moved = (
      await owner
        .post(`${base}/inventory/transfers`)
        .send({ itemId: itemA, fromLocationId: mainId, toLocationId: depotId, quantity: 4 })
        .expect(201)
    ).body.data;
    const level = (id: string) =>
      moved.levels.find((l: { locationId: string }) => l.locationId === id);
    expect(level(mainId)).toMatchObject({ quantity: 3, damaged: 1, available: 2 });
    expect(level(depotId)).toMatchObject({ quantity: 4, available: 4 });
    expect(moved.onHand).toBe(7);

    const tooMany = await owner
      .post(`${base}/inventory/transfers`)
      .send({ itemId: itemA, fromLocationId: mainId, toLocationId: depotId, quantity: 3 })
      .expect(400);
    expect(tooMany.body.error.message).toMatch(/Only 2 sellable units/);
    await owner
      .post(`${base}/inventory/transfers`)
      .send({ itemId: itemA, fromLocationId: mainId, toLocationId: mainId, quantity: 1 })
      .expect(400);

    const inactive = (
      await owner.post(`${base}/locations`).send({ name: "Closed", isActive: false }).expect(201)
    ).body.data;
    await owner
      .post(`${base}/inventory/transfers`)
      .send({ itemId: itemA, fromLocationId: depotId, toLocationId: inactive.id, quantity: 1 })
      .expect(400);
  });

  it("runs transfer requests through approval, rejection and cancellation", async () => {
    const request = (
      await owner
        .post(`${base}/inventory/transfer-requests`)
        .send({ itemId: itemA, fromLocationId: depotId, toLocationId: mainId, quantity: 2 })
        .expect(201)
    ).body.data;
    expect(request.status).toBe("pending");
    expect(request.requestedBy.name).toBe("Test User");

    await owner
      .post(`${base}/inventory/transfer-requests`)
      .send({ itemId: itemA, fromLocationId: depotId, toLocationId: mainId, quantity: 999 })
      .expect(400);

    const approved = (
      await owner
        .post(`${base}/inventory/transfer-requests/${request.id}/decision`)
        .send({ status: "approved" })
        .expect(200)
    ).body.data;
    expect(approved.status).toBe("approved");
    expect(approved.approvedBy.name).toBe("Test User");
    const item = (await owner.get(`${base}/inventory/items/${itemA}`).expect(200)).body.data;
    expect(item.levels.find((l: { locationId: string }) => l.locationId === depotId).quantity).toBe(
      2,
    );
    expect(item.levels.find((l: { locationId: string }) => l.locationId === mainId).quantity).toBe(
      5,
    );

    await owner
      .post(`${base}/inventory/transfer-requests/${request.id}/decision`)
      .send({ status: "rejected", rejectionReason: "late" })
      .expect(409);

    const second = (
      await owner
        .post(`${base}/inventory/transfer-requests`)
        .send({ itemId: itemA, fromLocationId: depotId, toLocationId: mainId, quantity: 1 })
        .expect(201)
    ).body.data;
    await owner
      .post(`${base}/inventory/transfer-requests/${second.id}/decision`)
      .send({ status: "rejected" })
      .expect(400);
    const rejected = (
      await owner
        .post(`${base}/inventory/transfer-requests/${second.id}/decision`)
        .send({ status: "rejected", rejectionReason: "Not needed" })
        .expect(200)
    ).body.data;
    expect(rejected.rejectionReason).toBe("Not needed");

    const pending = (
      await owner.get(`${base}/inventory/transfer-requests?status=pending`).expect(200)
    ).body.data;
    expect(pending).toHaveLength(0);
    const movements = (
      await owner.get(`${base}/inventory/movements?reason=transfer&itemId=${itemA}`).expect(200)
    ).body.data;
    expect(movements).toHaveLength(2);
    expect(movements[0].reference).toBe(`transfer:${request.id}`);
  });

  it("filters the stock list and reports store-wide stats", async () => {
    const all = (await owner.get(`${base}/inventory/items`).expect(200)).body.data;
    expect(all).toHaveLength(2);

    const out = (await owner.get(`${base}/inventory/items?status=out_of_stock`).expect(200)).body
      .data;
    expect(out.map((i: { id: string }) => i.id)).toEqual([bareItem]);
    const inStock = (await owner.get(`${base}/inventory/items?status=in_stock`).expect(200)).body
      .data;
    expect(inStock.map((i: { id: string }) => i.id)).toEqual([itemA]);

    const byQuery = (await owner.get(`${base}/inventory/items?q=m6`).expect(200)).body.data;
    expect(byQuery).toHaveLength(1);
    const atDepot = (await owner.get(`${base}/inventory/items?locationId=${depotId}`).expect(200))
      .body.data;
    expect(atDepot.map((i: { id: string }) => i.id)).toEqual([itemA]);

    const stats = (await owner.get(`${base}/inventory/stats`).expect(200)).body.data;
    expect(stats).toEqual({
      itemCount: 2,
      totalOnHand: 7,
      lowStock: 0,
      outOfStock: 1,
      locationCount: 2,
    });
  });

  it("refuses to delete locations that hold stock or are the default", async () => {
    await owner.delete(`${base}/locations/${mainId}`).expect(400);
    await owner.delete(`${base}/locations/${depotId}`).expect(400);
    await owner
      .post(`${base}/inventory/transfers`)
      .send({ itemId: itemA, fromLocationId: depotId, toLocationId: mainId, quantity: 2 })
      .expect(201);
    await owner.delete(`${base}/locations/${depotId}`).expect(204);
    const item = (await owner.get(`${base}/inventory/items/${itemA}`).expect(200)).body.data;
    expect(item.onHand).toBe(7);
    expect(item.levels).toHaveLength(1);
    const ledger = (await owner.get(`${base}/inventory/movements?itemId=${itemA}`).expect(200)).body
      .data;
    expect(ledger[0]).toMatchObject({ fromLocation: null, toLocation: { id: mainId } });
  });

  it("lets viewers read stock but not move it", async () => {
    const viewerEmail = uniqueEmail("viewer");
    await owner
      .post(`${base}/invitations`)
      .send({ email: viewerEmail, role: "viewer" })
      .expect(201);
    const token = linkToken(t.mail.lastTo(viewerEmail)?.text, "invitations");
    const viewer = t.http();
    await signupVerified(t, viewer, viewerEmail);
    await viewer.post("/admin/v1/invitations/accept").send({ token }).expect(200);

    await viewer.get(`${base}/inventory/items`).expect(200);
    await viewer.get(`${base}/inventory/stats`).expect(200);
    await viewer.get(`${base}/locations`).expect(200);
    const forbidden = await viewer.post(`${base}/locations`).send({ name: "Nope" }).expect(403);
    expect(forbidden.body.error.missing).toEqual(["inventory.write"]);
    await viewer
      .post(`${base}/inventory/adjustments`)
      .send({ itemId: itemA, locationId: mainId, delta: 1 })
      .expect(403);
    await viewer
      .post(`${base}/inventory/transfer-requests`)
      .send({ itemId: itemA, fromLocationId: mainId, toLocationId: mainId, quantity: 1 })
      .expect(403);
  });

  it("hides inventory from other tenants", async () => {
    const stranger = t.http();
    await signupVerified(t, stranger);
    const other = await createOrgAndStore(stranger, "Other Co");
    const otherBase = `/admin/v1/stores/${other.storeId}`;

    await stranger.get(`${base}/inventory/items`).expect(404);
    await stranger.get(`${base}/locations`).expect(404);
    await stranger.get(`${otherBase}/inventory/items/${itemA}`).expect(404);
    const foreignLocation = (
      await stranger.post(`${otherBase}/locations`).send({ name: "Theirs" }).expect(201)
    ).body.data;
    await stranger
      .post(`${otherBase}/inventory/adjustments`)
      .send({ itemId: itemA, locationId: foreignLocation.id, delta: 5 })
      .expect(404);
    const crossLocation = await owner
      .post(`${base}/inventory/adjustments`)
      .send({ itemId: itemA, locationId: foreignLocation.id, delta: 5 })
      .expect(400);
    expect(crossLocation.body.error.fields[0].path).toBe("locationId");
    await stranger.get(`${otherBase}/inventory/movements?itemId=${itemA}`).expect(200);
    expect(
      (await stranger.get(`${otherBase}/inventory/movements?itemId=${itemA}`)).body.data,
    ).toHaveLength(0);
  });
});
