import { describe, expect, it } from "vitest";

import { createOrgAndStore, createTestApp, INTEGRATION_ENABLED, linkToken, signupVerified, uniqueEmail } from "./integration";

describe.skipIf(!INTEGRATION_ENABLED)("content: menus", () => {
  it("creates, updates (replacing items wholesale), and deletes a menu", async () => {
    const t = await createTestApp();
    const owner = t.http();
    await signupVerified(t, owner);
    const { storeId } = await createOrgAndStore(owner, "Menu Co");
    const base = `/admin/v1/stores/${storeId}`;

    const created = (
      await owner
        .post(`${base}/menus`)
        .send({ title: "Main menu", handle: "main-menu", items: [{ label: "Shop", url: "/collections", position: 0 }] })
        .expect(201)
    ).body.data;
    expect(created.items).toHaveLength(1);
    expect(created.items[0]).toMatchObject({ label: "Shop", url: "/collections" });

    const updated = (
      await owner
        .patch(`${base}/menus/${created.id}`)
        .send({ title: "Main navigation", items: [{ label: "New arrivals", url: "/collections/new", position: 0 }] })
        .expect(200)
    ).body.data;
    expect(updated.title).toBe("Main navigation");
    expect(updated.items).toHaveLength(1);
    expect(updated.items[0]).toMatchObject({ label: "New arrivals" });

    // A duplicate handle is refused, same as creation.
    await owner.post(`${base}/menus`).send({ title: "Another", handle: "footer" }).expect(201);
    await owner.patch(`${base}/menus/${created.id}`).send({ handle: "footer" }).expect(409);

    await owner.delete(`${base}/menus/${created.id}`).expect(204);
    await owner.get(`${base}/menus/${created.id}`).expect(404);

    await t.close();
  });

  it("gates writes behind content.write and hides menus across tenants", async () => {
    const t = await createTestApp();
    const owner = t.http();
    await signupVerified(t, owner);
    const { storeId } = await createOrgAndStore(owner, "Menu Co 2");
    const base = `/admin/v1/stores/${storeId}`;
    const menu = (await owner.post(`${base}/menus`).send({ title: "Main", handle: "main" }).expect(201)).body.data;

    const viewerEmail = uniqueEmail("viewer");
    await owner.post(`${base}/invitations`).send({ email: viewerEmail, role: "viewer" }).expect(201);
    const inviteToken = linkToken(t.mail.lastTo(viewerEmail)?.text, "invitations");
    const viewer = t.http();
    await signupVerified(t, viewer, viewerEmail);
    await viewer.post("/admin/v1/invitations/accept").send({ token: inviteToken }).expect(200);
    const forbidden = await viewer.patch(`${base}/menus/${menu.id}`).send({ title: "Nope" }).expect(403);
    expect(forbidden.body.error.missing).toEqual(["content.write"]);
    await viewer.get(`${base}/menus`).expect(200);

    const stranger = t.http();
    await signupVerified(t, stranger);
    const other = await createOrgAndStore(stranger, "Other Menu Co");
    const otherBase = `/admin/v1/stores/${other.storeId}`;
    expect((await stranger.get(`${otherBase}/menus`).expect(200)).body.data).toEqual([]);
    await stranger.get(`${base}/menus/${menu.id}`).expect(404);

    await t.close();
  });
});
