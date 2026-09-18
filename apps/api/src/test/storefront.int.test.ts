import { PrismaClient } from "@ocean/db";
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

describe.skipIf(!INTEGRATION_ENABLED)("storefront API: catalog, customer auth, guest cart", () => {
  let t: TestApp;
  let owner: ReturnType<TestApp["http"]>;
  let storeId: string;
  let base: string;
  let hostname: string;
  let boltId: string;
  let boltVariantId: string;
  let prisma: PrismaClient;

  beforeAll(async () => {
    await assertInfraReachable();
    t = await createTestApp();
    prisma = new PrismaClient();
    owner = t.http();
    await signupVerified(t, owner);
    ({ storeId } = await createOrgAndStore(owner, "Storefront Co"));
    base = `/admin/v1/stores/${storeId}`;
    hostname = `storefront-${storeId.slice(0, 8)}.test.local`;
    const org = await prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { organizationId: true } });
    await prisma.domain.create({
      data: { storeId, organizationId: org.organizationId, hostname, status: "verified", verifiedAt: new Date() },
    });

    const bolt = (
      await owner
        .post(`${base}/products`)
        .send({ title: "Steel Bolt", status: "active", variants: [{ sku: "BOLT-M6", price: 10_000 }] })
        .expect(201)
    ).body.data;
    boltId = bolt.id;
    boltVariantId = bolt.variants[0].id;
    await owner
      .post(`${base}/products`)
      .send({ title: "Unpublished Widget", status: "draft", variants: [{ sku: "WID-1", price: 5_000 }] })
      .expect(201);
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await t?.close();
  });

  it("lists only active products for an anonymous shopper, priced at base", async () => {
    const guest = t.http();
    const list = (
      await guest.get("/storefront/v1/products").set("Host", hostname).expect(200)
    ).body.data;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ title: "Steel Bolt", priceRange: { min: { amount: 10_000 } } });
    expect(list[0].cost).toBeUndefined();

    const detail = (
      await guest.get(`/storefront/v1/products/${boltId}`).set("Host", hostname).expect(200)
    ).body.data;
    expect(detail.variants[0]).toMatchObject({ price: { amount: 10_000 }, available: null });
    expect(detail.variants[0].cost).toBeUndefined();

    const byHandle = (
      await guest.get(`/storefront/v1/products/${detail.handle}`).set("Host", hostname).expect(200)
    ).body.data;
    expect(byHandle.id).toBe(boltId);
  });

  it("refuses storefront routes for an unknown host", async () => {
    const guest = t.http();
    await guest.get("/storefront/v1/products").set("Host", "no-such-store.test.local").expect(404);
  });

  it("never requires a merchant session for storefront routes", async () => {
    const guest = t.http();
    await guest.get("/storefront/v1/context").set("Host", hostname).expect(200);
  });

  it("signs a customer up, persists the session across requests, then logs them out", async () => {
    const shopper = t.http();
    const email = uniqueEmail("shopper");
    const signedUp = (
      await shopper
        .post("/storefront/v1/auth/signup")
        .set("Host", hostname)
        .send({ email, password: "ShopperPass1!", firstName: "Shopper" })
        .expect(201)
    ).body.data;
    expect(signedUp.email).toBe(email);

    const me = (await shopper.get("/storefront/v1/auth/me").set("Host", hostname).expect(200)).body.data;
    expect(me.id).toBe(signedUp.id);

    await shopper.post("/storefront/v1/auth/logout").set("Host", hostname).send({}).expect(200);
    await shopper.get("/storefront/v1/auth/me").set("Host", hostname).expect(401);

    const loggedIn = (
      await shopper
        .post("/storefront/v1/auth/login")
        .set("Host", hostname)
        .send({ email, password: "ShopperPass1!" })
        .expect(200)
    ).body.data;
    expect(loggedIn.id).toBe(signedUp.id);

    const wrongPassword = await shopper
      .post("/storefront/v1/auth/login")
      .set("Host", hostname)
      .send({ email, password: "nope" })
      .expect(401);
    expect(wrongPassword.body.error.code).toBe("unauthenticated");
  });

  it("only shows a restricted company's customer their assigned catalog", async () => {
    const company = (
      await owner.post(`${base}/companies`).send({ legalName: "Restricted Buyer Co" }).expect(201)
    ).body.data;
    const catalog = (
      await owner
        .post(`${base}/catalogs`)
        .send({ name: "Bolts only", status: "active", productIds: [boltId] })
        .expect(201)
    ).body.data;
    await owner.post(`${base}/catalogs/${catalog.id}/assignments`).send({ companyId: company.id }).expect(201);

    const otherProduct = (
      await owner
        .post(`${base}/products`)
        .send({ title: "Not In Catalog", status: "active", variants: [{ sku: "NIC-1", price: 1_000 }] })
        .expect(201)
    ).body.data;

    const shopper = t.http();
    const email = uniqueEmail("restricted");
    await shopper
      .post("/storefront/v1/auth/signup")
      .set("Host", hostname)
      .send({ email, password: "ShopperPass1!" })
      .expect(201);
    const customerId = (await shopper.get("/storefront/v1/auth/me").set("Host", hostname).expect(200))
      .body.data.id;
    await owner
      .post(`${base}/companies/${company.id}/users`)
      .send({ customerId, role: "buyer" })
      .expect(201);

    const list = (
      await shopper.get("/storefront/v1/products").set("Host", hostname).expect(200)
    ).body.data;
    expect(list.map((p: { id: string }) => p.id)).toEqual([boltId]);
    expect(list.some((p: { id: string }) => p.id === otherProduct.id)).toBe(false);

    await shopper.get(`/storefront/v1/products/${otherProduct.id}`).set("Host", hostname).expect(404);
  });

  it("only exposes published pages, by handle, never drafts", async () => {
    await owner
      .post(`${base}/pages`)
      .send({ title: "About Us", handle: "about-us", status: "published", bodyRich: { html: "<p>Hi</p>" } })
      .expect(201);
    await owner
      .post(`${base}/pages`)
      .send({ title: "Coming Soon", handle: "coming-soon", status: "draft" })
      .expect(201);

    const guest = t.http();
    const list = (await guest.get("/storefront/v1/pages").set("Host", hostname).expect(200)).body.data;
    expect(list.map((p: { handle: string }) => p.handle)).toEqual(["about-us"]);

    const page = (
      await guest.get("/storefront/v1/pages/about-us").set("Host", hostname).expect(200)
    ).body.data;
    expect(page).toMatchObject({ title: "About Us", bodyRich: { html: "<p>Hi</p>" } });

    await guest.get("/storefront/v1/pages/coming-soon").set("Host", hostname).expect(404);
  });

  it("supports a guest cart end to end through checkout", async () => {
    const guest = t.http();
    await owner
      .post(`${base}/inventory/items`)
      .send({ productVariantId: boltVariantId })
      .expect(201)
      .then(async (res) => {
        const locationId = (await owner.post(`${base}/locations`).send({ name: "Storefront WH" }).expect(201))
          .body.data.id;
        await owner
          .post(`${base}/inventory/adjustments`)
          .send({ itemId: res.body.data.id, locationId, delta: 20 })
          .expect(201);
      });

    const cart = (
      await guest
        .post("/storefront/v1/cart/items")
        .set("Host", hostname)
        .send({ variantId: boltVariantId, quantity: 2 })
        .expect(200)
    ).body.data;
    expect(cart.items).toHaveLength(1);
    expect(cart.totals.subtotal).toMatchObject({ amount: 20_000 });

    const sameCart = (await guest.get("/storefront/v1/cart").set("Host", hostname).expect(200)).body.data;
    expect(sameCart.id).toBe(cart.id);

    const placed = (
      await guest
        .post("/storefront/v1/cart/checkout")
        .set("Host", hostname)
        .send({ email: uniqueEmail("guest-buyer") })
        .expect(201)
    ).body.data;
    expect(placed.orderId).toBeTruthy();

    const order = (await owner.get(`${base}/orders/${placed.orderId}`).expect(200)).body.data;
    expect(order.source).toBe("storefront");
    expect(order.totals.total).toMatchObject({ amount: 20_000 });
  });
});
