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

describe.skipIf(!INTEGRATION_ENABLED)(
  "catalogs & pricing: visibility, price lists, tiers, quantity rules, contracts, quotes",
  () => {
    let t: TestApp;
    let owner: ReturnType<TestApp["http"]>;
    let storeId: string;
    let base: string;
    let bolt: { id: string; variants: { id: string; sku: string }[] };
    let glove: { id: string; variants: { id: string; sku: string }[] };
    let acmeId: string;
    let hqId: string;
    let branchId: string;
    let catalogId: string;
    let listId: string;

    const boltM6 = () => bolt.variants[0]!.id;
    const boltM8 = () => bolt.variants[1]!.id;
    const gloveL = () => glove.variants[0]!.id;

    beforeAll(async () => {
      await assertInfraReachable();
      t = await createTestApp();
      owner = t.http();
      await signupVerified(t, owner);
      ({ storeId } = await createOrgAndStore(owner, "Pricing Co"));
      base = `/admin/v1/stores/${storeId}`;
      bolt = (
        await owner
          .post(`${base}/products`)
          .send({
            title: "Steel Bolt",
            status: "active",
            options: [{ name: "Size", values: ["M6", "M8"] }],
            variants: [
              { optionValues: ["M6"], sku: "BOLT-M6", price: 10_000 },
              { optionValues: ["M8"], sku: "BOLT-M8", price: 12_000 },
            ],
          })
          .expect(201)
      ).body.data;
      glove = (
        await owner
          .post(`${base}/products`)
          .send({
            title: "Work Glove",
            status: "active",
            variants: [{ sku: "GLOVE-L", price: 5_000 }],
          })
          .expect(201)
      ).body.data;
      const acme = (
        await owner
          .post(`${base}/companies`)
          .send({
            legalName: "ACME Ltd",
            location: { name: "HQ", shippingAddress: address },
          })
          .expect(201)
      ).body.data;
      acmeId = acme.id;
      hqId = acme.locations[0].id;
      branchId = (
        await owner
          .post(`${base}/companies/${acmeId}/locations`)
          .send({ name: "Branch", shippingAddress: { ...address, city: "Izmir" } })
          .expect(201)
      ).body.data.id;
    });
    afterAll(async () => {
      await t?.close();
    });

    it("prices at base for anonymous buyers with everything visible", async () => {
      const quote = (
        await owner
          .post(`${base}/pricing/quote`)
          .send({ items: [{ variantId: boltM6(), quantity: 3 }] })
          .expect(200)
      ).body.data;
      expect(quote.catalogRestricted).toBe(false);
      expect(quote.items[0]).toMatchObject({
        visible: true,
        source: "base",
        unitPrice: { amount: 10_000, currency: "TRY" },
        lineTotal: { amount: 30_000, currency: "TRY" },
        quantityRule: { ok: true },
      });
      expect(quote.subtotal.amount).toBe(30_000);
    });

    it("restricts a company to the products in its active catalogs", async () => {
      const catalog = (
        await owner
          .post(`${base}/catalogs`)
          .send({ name: "Distributors", productIds: [bolt.id] })
          .expect(201)
      ).body.data;
      catalogId = catalog.id;
      expect(catalog.productCount).toBe(1);
      await owner.post(`${base}/catalogs`).send({ name: "Distributors" }).expect(409);

      const assignment = (
        await owner
          .post(`${base}/catalogs/${catalogId}/assignments`)
          .send({ companyId: acmeId })
          .expect(201)
      ).body.data;
      expect(assignment.company.displayName).toBe("ACME Ltd");
      await owner
        .post(`${base}/catalogs/${catalogId}/assignments`)
        .send({ companyId: acmeId })
        .expect(409);
      await owner
        .post(`${base}/catalogs/${catalogId}/assignments`)
        .send({ companyId: acmeId, companyLocationId: hqId })
        .expect(400);

      // Draft catalogs do not restrict anyone.
      let quote = (
        await owner
          .post(`${base}/pricing/quote`)
          .send({
            buyer: { companyId: acmeId },
            items: [
              { variantId: boltM6(), quantity: 1 },
              { variantId: gloveL(), quantity: 1 },
            ],
          })
          .expect(200)
      ).body.data;
      expect(quote.catalogRestricted).toBe(false);

      await owner
        .patch(`${base}/catalogs/${catalogId}`)
        .send({ version: catalog.version, status: "active" })
        .expect(200);
      quote = (
        await owner
          .post(`${base}/pricing/quote`)
          .send({
            buyer: { companyLocationId: branchId },
            items: [
              { variantId: boltM6(), quantity: 1 },
              { variantId: gloveL(), quantity: 1 },
            ],
          })
          .expect(200)
      ).body.data;
      expect(quote.catalogRestricted).toBe(true);
      expect(quote.buyer.resolvedCompanyId).toBe(acmeId);
      expect(quote.items.map((i: { visible: boolean }) => i.visible)).toEqual([true, false]);

      const products = (await owner.get(`${base}/catalogs/${catalogId}/products`).expect(200)).body
        .data;
      expect(products.map((p: { title: string }) => p.title)).toEqual(["Steel Bolt"]);
      await owner
        .post(`${base}/catalogs/${catalogId}/products`)
        .send({ productIds: ["00000000-0000-4000-8000-000000000000"] })
        .expect(400);
    });

    it("applies the highest-priority assigned price list, explicit prices first", async () => {
      const list = (
        await owner
          .post(`${base}/price-lists`)
          .send({ name: "Wholesale", status: "active", adjustmentBps: -2000, priority: 10 })
          .expect(201)
      ).body.data;
      listId = list.id;
      await owner.post(`${base}/price-lists`).send({ name: "Euro", currency: "EUR" }).expect(400);
      await owner
        .put(`${base}/price-lists/${listId}/prices`)
        .send({ prices: [{ variantId: boltM8(), price: 9_000, compareAtPrice: 12_000 }] })
        .expect(200);
      await owner
        .post(`${base}/price-lists/${listId}/assignments`)
        .send({ companyId: acmeId })
        .expect(201);

      const lower = (
        await owner
          .post(`${base}/price-lists`)
          .send({ name: "Low priority", status: "active", adjustmentBps: -5000, priority: 1 })
          .expect(201)
      ).body.data;
      await owner
        .post(`${base}/price-lists/${lower.id}/assignments`)
        .send({ companyLocationId: hqId })
        .expect(201);

      const quote = (
        await owner
          .post(`${base}/pricing/quote`)
          .send({
            buyer: { companyLocationId: hqId },
            items: [
              { variantId: boltM6(), quantity: 1 },
              { variantId: boltM8(), quantity: 2 },
            ],
          })
          .expect(200)
      ).body.data;
      expect(quote.items[0]).toMatchObject({
        source: "price_list",
        priceListId: listId,
        unitPrice: { amount: 8_000 },
      });
      expect(quote.items[1]).toMatchObject({
        source: "price_list",
        unitPrice: { amount: 9_000 },
        compareAtPrice: { amount: 12_000 },
        lineTotal: { amount: 18_000 },
      });

      const prices = (await owner.get(`${base}/price-lists/${listId}/prices`).expect(200)).body
        .data;
      expect(prices).toHaveLength(1);
      expect(prices[0]).toMatchObject({ sku: "BOLT-M8", basePrice: { amount: 12_000 } });
    });

    it("layers volume tiers on top of the list price and reports every break", async () => {
      const rule = (
        await owner
          .post(`${base}/pricing/volume-rules`)
          .send({
            name: "Bolt breaks",
            scope: "product",
            scopeId: bolt.id,
            tierType: "percent_off",
            tiers: [
              { minQuantity: 10, value: 500 },
              { minQuantity: 50, value: 1500 },
            ],
          })
          .expect(201)
      ).body.data;
      expect(rule.scopeLabel).toBe("Steel Bolt");
      await owner
        .post(`${base}/pricing/volume-rules`)
        .send({
          name: "Bad",
          scope: "store",
          tierType: "percent_off",
          tiers: [
            { minQuantity: 50, value: 100 },
            { minQuantity: 10, value: 200 },
          ],
        })
        .expect(400);

      const quote = (
        await owner
          .post(`${base}/pricing/quote`)
          .send({
            buyer: { companyId: acmeId },
            items: [
              { variantId: boltM6(), quantity: 60 },
              { variantId: boltM6(), quantity: 5 },
            ],
          })
          .expect(200)
      ).body.data;
      expect(quote.items[0]).toMatchObject({
        source: "volume",
        volumeRuleId: rule.id,
        appliedTier: { minQuantity: 50, value: 1500 },
        unitPrice: { amount: 6_800 },
      });
      expect(quote.items[0].tiers).toEqual([
        { minQuantity: 10, unitPrice: { amount: 7_600, currency: "TRY" } },
        { minQuantity: 50, unitPrice: { amount: 6_800, currency: "TRY" } },
      ]);
      expect(quote.items[1]).toMatchObject({ source: "price_list", unitPrice: { amount: 8_000 } });

      // A variant-scoped fixed-price rule is more specific and wins.
      await owner
        .post(`${base}/pricing/volume-rules`)
        .send({
          name: "M6 pallet",
          scope: "variant",
          scopeId: boltM6(),
          tierType: "fixed_price",
          tiers: [{ minQuantity: 100, value: 6_000 }],
        })
        .expect(201);
      const pallet = (
        await owner
          .post(`${base}/pricing/quote`)
          .send({ buyer: { companyId: acmeId }, items: [{ variantId: boltM6(), quantity: 100 }] })
          .expect(200)
      ).body.data;
      expect(pallet.items[0]).toMatchObject({ unitPrice: { amount: 6_000 }, source: "volume" });
    });

    it("enforces quantity rules and suggests a valid quantity", async () => {
      const rule = (
        await owner
          .put(`${base}/pricing/quantity-rules`)
          .send({ scope: "product", scopeId: bolt.id, minQuantity: 12, increment: 6 })
          .expect(200)
      ).body.data;
      expect(rule.scopeLabel).toBe("Steel Bolt");
      await owner
        .put(`${base}/pricing/quantity-rules`)
        .send({ scope: "product", scopeId: bolt.id })
        .expect(400);
      await owner
        .put(`${base}/pricing/quantity-rules`)
        .send({ scope: "variant", scopeId: boltM8(), minQuantity: 1, maxQuantity: 20 })
        .expect(200);

      const quote = (
        await owner
          .post(`${base}/pricing/quote`)
          .send({
            items: [
              { variantId: boltM6(), quantity: 13 },
              { variantId: boltM8(), quantity: 25 },
              { variantId: gloveL(), quantity: 1 },
            ],
          })
          .expect(200)
      ).body.data;
      expect(quote.items[0].quantityRule).toMatchObject({
        ok: false,
        suggestedQuantity: 18,
        increment: 6,
      });
      // Variant rule beats the product rule.
      expect(quote.items[1].quantityRule).toMatchObject({ ok: false, suggestedQuantity: 20 });
      expect(quote.items[2].quantityRule.ok).toBe(true);
      expect(
        (await owner.get(`${base}/pricing/quantity-rules`).expect(200)).body.data,
      ).toHaveLength(2);
    });

    it("lets contract prices beat everything, location over company, inside their window", async () => {
      const contract = (
        await owner
          .put(`${base}/pricing/contract-prices`)
          .send({ companyId: acmeId, variantId: boltM6(), price: 7_000, note: "2026 deal" })
          .expect(200)
      ).body.data;
      expect(contract).toMatchObject({
        company: { id: acmeId },
        location: null,
        price: { amount: 7_000 },
        basePrice: { amount: 10_000 },
        isCurrent: true,
      });
      await owner
        .put(`${base}/pricing/contract-prices`)
        .send({ companyId: acmeId, companyLocationId: hqId, variantId: boltM6(), price: 6_500 })
        .expect(200);
      const expired = (
        await owner
          .put(`${base}/pricing/contract-prices`)
          .send({
            companyId: acmeId,
            companyLocationId: branchId,
            variantId: boltM6(),
            price: 1,
            validFrom: "2020-01-01T00:00:00.000Z",
            validTo: "2020-12-31T00:00:00.000Z",
          })
          .expect(200)
      ).body.data;
      expect(expired.isCurrent).toBe(false);

      const forCompany = (
        await owner
          .post(`${base}/pricing/quote`)
          .send({ buyer: { companyId: acmeId }, items: [{ variantId: boltM6(), quantity: 100 }] })
          .expect(200)
      ).body.data;
      expect(forCompany.items[0]).toMatchObject({
        source: "contract",
        contractPriceId: contract.id,
        unitPrice: { amount: 7_000 },
        tiers: [],
        compareAtPrice: null,
      });
      const atHq = (
        await owner
          .post(`${base}/pricing/quote`)
          .send({
            buyer: { companyLocationId: hqId },
            items: [{ variantId: boltM6(), quantity: 1 }],
          })
          .expect(200)
      ).body.data;
      expect(atHq.items[0].unitPrice.amount).toBe(6_500);
      const atBranch = (
        await owner
          .post(`${base}/pricing/quote`)
          .send({
            buyer: { companyLocationId: branchId },
            items: [{ variantId: boltM6(), quantity: 1 }],
          })
          .expect(200)
      ).body.data;
      expect(atBranch.items[0].unitPrice.amount).toBe(7_000);

      // Upsert updates in place rather than duplicating.
      await owner
        .put(`${base}/pricing/contract-prices`)
        .send({ companyId: acmeId, variantId: boltM6(), price: 7_100 })
        .expect(200);
      const list = (await owner.get(`${base}/pricing/contract-prices?companyId=${acmeId}`)).body
        .data;
      expect(list).toHaveLength(3);

      const overview = (await owner.get(`${base}/pricing/companies/${acmeId}`).expect(200)).body
        .data;
      expect(overview.catalogs.map((c: { name: string }) => c.name)).toEqual(["Distributors"]);
      expect(overview.priceLists.map((p: { via: string }) => p.via).sort()).toEqual([
        "company",
        "location",
      ]);
      expect(overview.contractPriceCount).toBe(3);
    });

    it("rejects buyers and targets from other stores and gates writes", async () => {
      const stranger = t.http();
      await signupVerified(t, stranger);
      const other = await createOrgAndStore(stranger, "Other Co");
      const otherBase = `/admin/v1/stores/${other.storeId}`;
      const theirs = (
        await stranger.post(`${otherBase}/companies`).send({ legalName: "Their Co" }).expect(201)
      ).body.data;

      const foreignBuyer = await owner
        .post(`${base}/pricing/quote`)
        .send({ buyer: { companyId: theirs.id }, items: [{ variantId: boltM6(), quantity: 1 }] })
        .expect(400);
      expect(foreignBuyer.body.error.fields[0].path).toBe("buyer.companyId");
      await stranger
        .post(`${otherBase}/pricing/quote`)
        .send({ items: [{ variantId: boltM6(), quantity: 1 }] })
        .expect(400);
      await owner
        .post(`${base}/catalogs/${catalogId}/assignments`)
        .send({ companyId: theirs.id })
        .expect(400);
      await stranger.get(`${base}/catalogs`).expect(404);
      await stranger.get(`${otherBase}/catalogs/${catalogId}`).expect(404);
      await stranger.get(`${otherBase}/price-lists/${listId}`).expect(404);
      expect(
        (await stranger.get(`${otherBase}/pricing/volume-rules`).expect(200)).body.data,
      ).toEqual([]);

      const viewerEmail = uniqueEmail("viewer");
      await owner
        .post(`${base}/invitations`)
        .send({ email: viewerEmail, role: "viewer" })
        .expect(201);
      const token = linkToken(t.mail.lastTo(viewerEmail)?.text, "invitations");
      const viewer = t.http();
      await signupVerified(t, viewer, viewerEmail);
      await viewer.post("/admin/v1/invitations/accept").send({ token }).expect(200);
      await viewer.get(`${base}/catalogs`).expect(200);
      await viewer
        .post(`${base}/pricing/quote`)
        .send({ items: [{ variantId: boltM6(), quantity: 1 }] })
        .expect(200);
      const forbidden = await viewer.post(`${base}/catalogs`).send({ name: "Nope" }).expect(403);
      expect(forbidden.body.error.missing).toEqual(["catalogs.write"]);
      await viewer
        .put(`${base}/pricing/contract-prices`)
        .send({ companyId: acmeId, variantId: boltM6(), price: 1 })
        .expect(403);
    });

    it("deletes catalogs and price lists cleanly", async () => {
      await owner.delete(`${base}/price-lists/${listId}`).expect(204);
      await owner.delete(`${base}/catalogs/${catalogId}`).expect(204);
      const quote = (
        await owner
          .post(`${base}/pricing/quote`)
          .send({ buyer: { companyId: acmeId }, items: [{ variantId: gloveL(), quantity: 1 }] })
          .expect(200)
      ).body.data;
      expect(quote.catalogRestricted).toBe(false);
      expect(quote.items[0]).toMatchObject({ visible: true, source: "base" });
    });
  },
);
