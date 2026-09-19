import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  assertInfraReachable,
  createOrgAndStore,
  createTestApp,
  INTEGRATION_ENABLED,
  uniqueEmail,
  signupVerified,
  linkToken,
  type TestApp,
} from "./integration";
import { WebhookDispatchService } from "../modules/developers/webhook-dispatch.service";

const address = { address1: "Sanayi Cd. 5", city: "Ankara", countryCode: "TR" };

describe.skipIf(!INTEGRATION_ENABLED)("phase 15: public API, OAuth apps, API keys, webhooks, app blocks", () => {
  let t: TestApp;
  let owner: ReturnType<TestApp["http"]>;
  let storeId: string;
  let base: string;

  beforeAll(async () => {
    await assertInfraReachable();
    t = await createTestApp();
    owner = t.http();
    await signupVerified(t, owner);
    ({ storeId } = await createOrgAndStore(owner, "Dev Platform Co"));
    base = `/admin/v1/stores/${storeId}/developer`;
  });
  afterAll(async () => {
    await t?.close();
  });

  it("registers an app, issues an OAuth token via client_credentials, and reads products/orders through the Developer API with scope enforcement", async () => {
    const product = (
      await owner
        .post(`/admin/v1/stores/${storeId}/products`)
        .send({ title: "Dev Widget", status: "active", variants: [{ sku: "DEV-1", price: 5_000 }] })
        .expect(201)
    ).body.data;

    const app = (
      await owner
        .post(`${base}/apps`)
        .send({ name: "Integration Test App", scopes: ["products.read", "orders.read"] })
        .expect(201)
    ).body.data;
    expect(app.clientSecret).toMatch(/^ocean_cs_/);

    // Unknown scopes are rejected up front.
    await owner
      .post(`${base}/apps`)
      .send({ name: "Bad App", scopes: ["not.a.real.scope"] })
      .expect(400);

    const token = (
      await owner
        .post(`/api/2026-01/oauth/token`)
        .send({ grant_type: "client_credentials", client_id: app.clientId, client_secret: app.clientSecret })
        .expect(201)
    ).body.data;
    expect(token.token_type).toBe("bearer");

    const products = (
      await owner.get("/api/2026-01/products").set("Authorization", `Bearer ${token.access_token}`).expect(200)
    ).body;
    expect(products.data.some((p: { id: string }) => p.id === product.id)).toBe(true);

    // Wrong/missing bearer token is refused.
    await owner.get("/api/2026-01/products").expect(401);
    await owner.get("/api/2026-01/products").set("Authorization", "Bearer not-a-real-token").expect(401);

    // A products-only app is refused on the orders endpoint it was never scoped for.
    const scopeless = (
      await owner
        .post(`${base}/apps`)
        .send({ name: "Products Only App", scopes: ["products.read"] })
        .expect(201)
    ).body.data;
    const scopelessToken = (
      await owner
        .post(`/api/2026-01/oauth/token`)
        .send({ grant_type: "client_credentials", client_id: scopeless.clientId, client_secret: scopeless.clientSecret })
        .expect(201)
    ).body.data;
    const refused = await owner
      .get("/api/2026-01/orders")
      .set("Authorization", `Bearer ${scopelessToken.access_token}`)
      .expect(403);
    expect(refused.body.error.missing).toEqual(["orders.read"]);

    // Revoking the app also revokes every key/token it issued.
    await owner.post(`${base}/apps/${app.id}/revoke`).send({}).expect(204);
    await owner.get("/api/2026-01/products").set("Authorization", `Bearer ${token.access_token}`).expect(401);
  });

  it("creates and revokes a static API key directly, without an app", async () => {
    const key = (
      await owner.post(`${base}/api-keys`).send({ name: "CLI key", scopes: ["products.read"] }).expect(201)
    ).body.data;
    expect(key.secret).toMatch(/^ocean_sk_/);

    await owner.get("/api/2026-01/products").set("Authorization", `Bearer ${key.secret}`).expect(200);

    await owner.post(`${base}/api-keys/${key.id}/revoke`).send({}).expect(204);
    await owner.get("/api/2026-01/products").set("Authorization", `Bearer ${key.secret}`).expect(401);
  });

  it("delivers a webhook with a valid HMAC signature when the subscribed event fires, and logs the delivery", async () => {
    // The dispatcher processes the outbox oldest-first, and this shared dev DB carries a large
    // backlog of unrelated historical DomainEvent rows (webhookRelayedAt is a brand-new column,
    // so every row starts unprocessed) — draining it to reach this test's own event takes
    // longer than the default test timeout.
    let received: { body: string; headers: Record<string, string | string[] | undefined> } | undefined;
    const server: Server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        received = { body: Buffer.concat(chunks).toString("utf8"), headers: req.headers };
        res.writeHead(200);
        res.end("ok");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const url = `http://127.0.0.1:${port}/hook`;

    const webhook = (
      await owner.post(`${base}/webhooks`).send({ topic: "order.created", url }).expect(201)
    ).body.data;
    expect(webhook.secret).toMatch(/^whsec_/);

    // Place a real order so a real order.created DomainEvent is written.
    const boltVariantId = (
      await owner
        .post(`/admin/v1/stores/${storeId}/products`)
        .send({ title: "Webhook Bolt", status: "active", variants: [{ sku: "WH-BOLT", price: 10_000 }] })
        .expect(201)
    ).body.data.variants[0].id;
    const locationId = (
      await owner.post(`/admin/v1/stores/${storeId}/locations`).send({ name: "Main" }).expect(201)
    ).body.data.id;
    const itemId = (
      await owner
        .post(`/admin/v1/stores/${storeId}/inventory/items`)
        .send({ productVariantId: boltVariantId })
        .expect(201)
    ).body.data.id;
    await owner
      .post(`/admin/v1/stores/${storeId}/inventory/adjustments`)
      .send({ itemId, locationId, delta: 5 })
      .expect(201);
    const company = (
      await owner
        .post(`/admin/v1/stores/${storeId}/companies`)
        .send({ legalName: "Webhook Buyer Co", location: { name: "HQ", shippingAddress: address } })
        .expect(201)
    ).body.data;
    const buyerId = (
      await owner
        .post(`/admin/v1/stores/${storeId}/companies/${company.id}/users`)
        .send({ email: uniqueEmail("whbuyer"), firstName: "Buyer", role: "buyer" })
        .expect(201)
    ).body.data.customer.id;
    const cart = (
      await owner
        .post(`/admin/v1/stores/${storeId}/carts`)
        .send({ buyer: { customerId: buyerId, companyLocationId: company.locations[0].id }, items: [{ variantId: boltVariantId, quantity: 1 }] })
        .expect(201)
    ).body.data;
    await owner
      .post(`/admin/v1/stores/${storeId}/carts/${cart.id}/checkout`)
      .set("Idempotency-Key", "webhook-chk-1")
      .send({ shippingAddress: address })
      .expect(201);

    const dispatcher = t.app.get(WebhookDispatchService);
    let processed = 0;
    for (let i = 0; i < 100; i++) {
      const n = await dispatcher.processOnce(2000);
      processed += n;
      if (n === 0) break;
    }
    expect(processed).toBeGreaterThanOrEqual(1);

    expect(received).toBeDefined();
    const timestamp = received?.headers["x-ocean-timestamp"] as string;
    const signature = received?.headers["x-ocean-signature"] as string;
    expect(timestamp).toBeTruthy();
    expect(signature).toBeTruthy();
    const expected = createHmac("sha256", webhook.secret as string)
      .update(`${timestamp}.${received?.body}`)
      .digest("hex");
    expect(signature).toBe(expected);
    const payload = JSON.parse(received?.body ?? "{}");
    expect(payload.topic).toBe("order.created");
    expect(payload.apiVersion).toBe("2026-01");

    const deliveries = (
      await owner.get(`${base}/webhooks/${webhook.id}/deliveries`).expect(200)
    ).body.data;
    expect(deliveries.some((d: { status: string }) => d.status === "delivered")).toBe(true);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  }, 60_000);

  it("registers app block type definitions and rejects a duplicate type for the same app", async () => {
    const app = (
      await owner.post(`${base}/apps`).send({ name: "Block App", scopes: ["products.read"] }).expect(201)
    ).body.data;
    const block = (
      await owner
        .post(`${base}/apps/${app.id}/blocks`)
        .send({ type: "testimonial", label: "Testimonial", settingsSchema: [{ key: "quote", label: "Quote", type: "text" }] })
        .expect(201)
    ).body.data;
    expect(block.type).toBe("testimonial");

    await owner
      .post(`${base}/apps/${app.id}/blocks`)
      .send({ type: "testimonial", label: "Testimonial again" })
      .expect(409);

    const list = (await owner.get(`${base}/apps/${app.id}/blocks`).expect(200)).body.data;
    expect(list).toHaveLength(1);
  });

  it("gates the developer platform behind apps.install and isolates tenants", async () => {
    const viewerEmail = uniqueEmail("viewer");
    await owner.post(`/admin/v1/stores/${storeId}/invitations`).send({ email: viewerEmail, role: "viewer" }).expect(201);
    const inviteToken = linkToken(t.mail.lastTo(viewerEmail)?.text, "invitations");
    const viewer = t.http();
    await signupVerified(t, viewer, viewerEmail);
    await viewer.post("/admin/v1/invitations/accept").send({ token: inviteToken }).expect(200);
    const forbidden = await viewer.get(`${base}/apps`).expect(403);
    expect(forbidden.body.error.missing).toEqual(["apps.install"]);

    const stranger = t.http();
    await signupVerified(t, stranger);
    const other = await createOrgAndStore(stranger, "Other Dev Platform Co");
    expect((await stranger.get(`/admin/v1/stores/${other.storeId}/developer/apps`).expect(200)).body.data).toEqual([]);
    await stranger.get(`${base}/apps`).expect(404);
  });
});
