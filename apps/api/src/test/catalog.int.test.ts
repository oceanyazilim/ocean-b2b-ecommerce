import { existsSync } from "node:fs";
import { resolve } from "node:path";

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  assertInfraReachable,
  createOrgAndStore,
  createTestApp,
  INTEGRATION_ENABLED,
  signupVerified,
  type TestApp,
} from "./integration";

const glove = (overrides: Record<string, unknown> = {}) => ({
  title: "Industrial Glove",
  descriptionHtml: "<p>Tough <script>alert(1)</script>gloves</p>",
  vendor: "ACME Safety",
  productType: "Gloves",
  tags: ["ppe", "hands"],
  status: "active",
  options: [
    { name: "Color", values: ["Black", "Red"] },
    { name: "Size", values: ["M", "L", "XL"] },
  ],
  variants: [
    ["Black", "M"],
    ["Black", "L"],
    ["Black", "XL"],
    ["Red", "M"],
    ["Red", "L"],
    ["Red", "XL"],
  ].map(([color, size], i) => ({
    optionValues: [color, size],
    sku: `GLV-${color}-${size}`.toUpperCase(),
    price: 10000 + i * 100,
  })),
  ...overrides,
});

describe.skipIf(!INTEGRATION_ENABLED)("catalog: products, collections, media, metafields", () => {
  let t: TestApp;
  let owner: ReturnType<TestApp["http"]>;
  let storeId: string;

  beforeAll(async () => {
    await assertInfraReachable();
    t = await createTestApp();
    owner = t.http();
    await signupVerified(t, owner);
    ({ storeId } = await createOrgAndStore(owner, "Catalog Co"));
  });
  afterAll(async () => {
    await t?.close();
  });

  it("creates a product with generated variants, sanitized html and a unique handle", async () => {
    const res = await owner.post(`/admin/v1/stores/${storeId}/products`).send(glove()).expect(201);
    const p = res.body.data;
    expect(p.handle).toBe("industrial-glove");
    expect(p.descriptionHtml).toBe("<p>Tough gloves</p>");
    expect(p.variants).toHaveLength(6);
    expect(p.variants[0]).toMatchObject({
      title: "Black / M",
      sku: "GLV-BLACK-M",
      price: { amount: 10000, currency: "TRY" },
    });
    expect(p.priceRange).toEqual({
      min: { amount: 10000, currency: "TRY" },
      max: { amount: 10500, currency: "TRY" },
    });
    expect(p.publishedAt).not.toBeNull();

    const second = await owner
      .post(`/admin/v1/stores/${storeId}/products`)
      .send(glove({ variants: [{ optionValues: ["Black", "M"], price: 1, sku: "GLV-BLACK-M" }] }))
      .expect(409);
    expect(second.body.error.message).toMatch(/SKU already in use/);
    const third = await owner
      .post(`/admin/v1/stores/${storeId}/products`)
      .send(glove({ variants: [{ optionValues: ["Black", "M"], price: 1, sku: null }] }))
      .expect(201);
    expect(third.body.data.handle).toBe("industrial-glove-2");
  });

  it("leaves fields untouched when a patch omits them", async () => {
    const created = (
      await owner
        .post(`/admin/v1/stores/${storeId}/products`)
        .send(
          glove({
            title: "Partial Patch Jacket",
            tags: ["outerwear"],
            variants: glove().variants.map((v) => ({ ...v, sku: `PPJ-${v.sku}` })),
          }),
        )
        .expect(201)
    ).body.data;
    const patched = (
      await owner
        .patch(`/admin/v1/stores/${storeId}/products/${created.id}`)
        .send({ version: created.version, title: "Partial Patch Jacket II" })
        .expect(200)
    ).body.data;
    expect(patched.title).toBe("Partial Patch Jacket II");
    expect(patched.status).toBe("active");
    expect(patched.tags).toEqual(["outerwear"]);
    expect(patched.descriptionHtml).toBe("<p>Tough gloves</p>");
    expect(patched.options).toHaveLength(2);
    expect(patched.variants).toHaveLength(6);
  });

  it("keeps variant ids across edits, enforces versions and status transitions", async () => {
    const created = (
      await owner
        .post(`/admin/v1/stores/${storeId}/products`)
        .send(
          glove({
            title: "Versioned Boot",
            variants: [
              { optionValues: ["Black", "M"], price: 500 },
              { optionValues: ["Red", "L"], price: 600 },
            ],
          }),
        )
        .expect(201)
    ).body.data;
    const blackM = created.variants.find((v: { title: string }) => v.title === "Black / M");

    const updated = (
      await owner
        .patch(`/admin/v1/stores/${storeId}/products/${created.id}`)
        .send({
          version: created.version,
          options: [
            { name: "Color", values: ["Black", "Green"] },
            { name: "Size", values: ["M"] },
          ],
          variants: [
            { optionValues: ["Black", "M"], price: 550 },
            { optionValues: ["Green", "M"], price: 700 },
          ],
        })
        .expect(200)
    ).body.data;
    expect(updated.version).toBe(created.version + 1);
    expect(updated.variants).toHaveLength(2);
    expect(updated.variants.find((v: { title: string }) => v.title === "Black / M").id).toBe(
      blackM.id,
    );
    expect(
      updated.variants.find((v: { title: string }) => v.title === "Black / M").price.amount,
    ).toBe(550);

    const stale = await owner
      .patch(`/admin/v1/stores/${storeId}/products/${created.id}`)
      .send({ version: created.version, title: "Stale" })
      .expect(409);
    expect(stale.body.error.code).toBe("conflict");

    await owner
      .post(`/admin/v1/stores/${storeId}/products/${created.id}/status`)
      .send({ status: "archived" })
      .expect(200);
    const bad = await owner
      .post(`/admin/v1/stores/${storeId}/products/${created.id}/status`)
      .send({ status: "active" })
      .expect(400);
    expect(bad.body.error.fields[0].path).toBe("status");
  });

  it("lists with search, status filter and cursor pagination; bulk actions work", async () => {
    const list = await owner
      .get(`/admin/v1/stores/${storeId}/products?q=glove&status=active&limit=1`)
      .expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.pageInfo.hasNextPage).toBe(true);
    const next = await owner
      .get(
        `/admin/v1/stores/${storeId}/products?q=glove&status=active&limit=1&cursor=${list.body.pageInfo.endCursor}`,
      )
      .expect(200);
    expect(next.body.data[0].id).not.toBe(list.body.data[0].id);

    const ids = [list.body.data[0].id, next.body.data[0].id];
    const bulk = await owner
      .post(`/admin/v1/stores/${storeId}/products/bulk`)
      .send({ ids, action: "add_tag", tag: "sale" })
      .expect(200);
    expect(bulk.body.data.affected).toBe(2);
    const tagged = await owner.get(`/admin/v1/stores/${storeId}/products?tag=sale`).expect(200);
    expect(tagged.body.data.map((p: { id: string }) => p.id).sort()).toEqual(ids.sort());
  });

  it("automated collections follow product changes and rule changes", async () => {
    const col = (
      await owner
        .post(`/admin/v1/stores/${storeId}/collections`)
        .send({
          title: "PPE on sale",
          type: "automated",
          rules: [
            { field: "tag", operator: "equals", value: "sale" },
            { field: "status", operator: "equals", value: "active" },
          ],
          rulesMatchAll: true,
        })
        .expect(201)
    ).body.data;
    expect(col.productCount).toBe(2);

    const products = await owner
      .get(`/admin/v1/stores/${storeId}/collections/${col.id}/products`)
      .expect(200);
    const victim = products.body.data[0];
    await owner
      .post(`/admin/v1/stores/${storeId}/products/bulk`)
      .send({ ids: [victim.id], action: "remove_tag", tag: "sale" })
      .expect(200);
    expect(
      (await owner.get(`/admin/v1/stores/${storeId}/collections/${col.id}`).expect(200)).body.data
        .productCount,
    ).toBe(1);

    const relaxed = await owner
      .patch(`/admin/v1/stores/${storeId}/collections/${col.id}`)
      .send({
        version: col.version,
        rules: [{ field: "vendor", operator: "contains", value: "acme" }],
      })
      .expect(200);
    expect(relaxed.body.data.productCount).toBeGreaterThanOrEqual(2);

    const preview = await owner
      .post(`/admin/v1/stores/${storeId}/collections/preview`)
      .send({ rules: [{ field: "price", operator: "gte", value: "100" }] })
      .expect(200);
    expect(preview.body.data.count).toBeGreaterThanOrEqual(1);

    const manual = (
      await owner
        .post(`/admin/v1/stores/${storeId}/collections`)
        .send({ title: "Picks", type: "manual" })
        .expect(201)
    ).body.data;
    await owner
      .post(`/admin/v1/stores/${storeId}/collections/${manual.id}/products`)
      .send({ productIds: [victim.id] })
      .expect(200);
    await owner
      .post(`/admin/v1/stores/${storeId}/collections/${col.id}/products`)
      .send({ productIds: [victim.id] })
      .expect(400);
  });

  it("uploads, serves and deletes media through the local adapter", async () => {
    const png = await sharp({
      create: { width: 12, height: 8, channels: 3, background: "#336699" },
    })
      .png()
      .toBuffer();
    const uploaded = await owner
      .post(`/admin/v1/stores/${storeId}/media`)
      .attach("file", png, "photo.PNG")
      .expect(201);
    const media = uploaded.body.data;
    expect(media).toMatchObject({
      kind: "image",
      mime: "image/png",
      width: 12,
      height: 8,
      originalFilename: "photo.PNG",
    });
    expect(media.url).toMatch(/^http:\/\/localhost:4000\/media\/stores\//);
    const stored = resolve(
      process.cwd(),
      ".storage",
      media.url.replace("http://localhost:4000/media/", ""),
    );
    expect(existsSync(stored)).toBe(true);

    const junk = await owner
      .post(`/admin/v1/stores/${storeId}/media`)
      .attach("file", Buffer.from("MZ  not-an-image"), "virus.png")
      .expect(400);
    expect(junk.body.error.message).toMatch(/Unsupported file type/);

    const product = (await owner.get(`/admin/v1/stores/${storeId}/products?q=Industrial&limit=1`))
      .body.data[0];
    const attached = await owner
      .post(`/admin/v1/stores/${storeId}/products/${product.id}/media`)
      .send({ mediaId: media.id })
      .expect(200);
    expect(attached.body.data.media[0].id).toBe(media.id);

    await owner.delete(`/admin/v1/stores/${storeId}/media/${media.id}`).expect(204);
    expect(existsSync(stored)).toBe(false);
    expect(
      (await owner.get(`/admin/v1/stores/${storeId}/products/${product.id}`)).body.data.media,
    ).toHaveLength(0);
  });

  it("validates metafields against definitions and same-store references", async () => {
    await owner
      .post(`/admin/v1/stores/${storeId}/metafield-definitions`)
      .send({
        ownerType: "product",
        namespace: "custom",
        key: "warranty_months",
        name: "Warranty",
        type: "integer",
        validations: { min: 0, max: 120 },
      })
      .expect(201);
    await owner
      .post(`/admin/v1/stores/${storeId}/metafield-definitions`)
      .send({
        ownerType: "product",
        namespace: "custom",
        key: "related",
        name: "Related product",
        type: "product_reference",
      })
      .expect(201);

    const product = (await owner.get(`/admin/v1/stores/${storeId}/products?limit=1`)).body.data[0];
    const bad = await owner
      .patch(`/admin/v1/stores/${storeId}/products/${product.id}/metafields`)
      .send({
        metafields: [
          { namespace: "custom", key: "warranty_months", value: 500 },
          { namespace: "custom", key: "nope", value: 1 },
        ],
      })
      .expect(400);
    expect(bad.body.error.fields.map((f: { path: string }) => f.path)).toEqual([
      "metafields[0].value",
      "metafields[1]",
    ]);

    const ok = await owner
      .patch(`/admin/v1/stores/${storeId}/products/${product.id}/metafields`)
      .send({
        metafields: [
          { namespace: "custom", key: "warranty_months", value: "24" },
          { namespace: "custom", key: "related", value: product.id },
        ],
      })
      .expect(200);
    expect(ok.body.data.find((m: { key: string }) => m.key === "warranty_months").value).toBe(24);
  });

  it("isolates catalog data between tenants and enforces write permissions", async () => {
    const stranger = t.http();
    await signupVerified(t, stranger);
    const other = await createOrgAndStore(stranger, "Other Co");
    const product = (await owner.get(`/admin/v1/stores/${storeId}/products?limit=1`)).body.data[0];

    await stranger.get(`/admin/v1/stores/${storeId}/products`).expect(404);
    await stranger.get(`/admin/v1/stores/${other.storeId}/products/${product.id}`).expect(404);
    await stranger
      .patch(`/admin/v1/stores/${other.storeId}/products/${product.id}`)
      .send({ version: 1, title: "x" })
      .expect(404);
    await stranger
      .post(`/admin/v1/stores/${other.storeId}/collections`)
      .send({ title: "Steal", type: "manual" })
      .expect(201);
    const steal = await stranger
      .post(`/admin/v1/stores/${other.storeId}/products`)
      .send(
        glove({
          title: "Copy",
          variants: [{ optionValues: ["Black", "M"], price: 1, sku: "GLV-BLACK-M" }],
        }),
      )
      .expect(201);
    expect(steal.body.data.variants[0].sku).toBe("GLV-BLACK-M");
  });
});
