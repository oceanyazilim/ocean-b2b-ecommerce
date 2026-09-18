import { PrismaClient } from "@ocean/db";
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

describe.skipIf(!INTEGRATION_ENABLED)("phase 9: theme catalog, install, edit, publish", () => {
  let t: TestApp;
  let owner: ReturnType<TestApp["http"]>;
  let storeId: string;
  let base: string;
  let hostname: string;
  let themeId: string;
  let prisma: PrismaClient;

  beforeAll(async () => {
    await assertInfraReachable();
    t = await createTestApp();
    prisma = new PrismaClient();
    owner = t.http();
    await signupVerified(t, owner);
    ({ storeId } = await createOrgAndStore(owner, "Theme Co"));
    base = `/admin/v1/stores/${storeId}`;
    hostname = `theme-${storeId.slice(0, 8)}.test.local`;
    const org = await prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { organizationId: true } });
    await prisma.domain.create({
      data: { storeId, organizationId: org.organizationId, hostname, status: "verified", verifiedAt: new Date() },
    });
    const foundation = await prisma.theme.findUniqueOrThrow({ where: { slug: "foundation" } });
    themeId = foundation.id;
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await t?.close();
  });

  it("lists the seeded Foundation theme in the catalog with its manifest", async () => {
    const catalog = (await owner.get(`${base}/themes/catalog`).expect(200)).body.data;
    const foundation = catalog.find((c: { slug: string }) => c.slug === "foundation");
    expect(foundation).toBeDefined();
    expect(foundation.latestRelease.manifest.sections.map((s: { type: string }) => s.type)).toContain(
      "hero",
    );
  });

  it("installs a theme, edits its draft, publishes it, and serves the published version on the storefront", async () => {
    const installed = (
      await owner.post(`${base}/themes`).send({ themeId, name: "My Foundation" }).expect(201)
    ).body.data;
    expect(installed.role).toBe("unpublished");
    expect(installed.versions).toHaveLength(1);
    const draftVersionId = installed.versions[0].id;

    // Not published yet: no theme on the storefront.
    const beforePublish = await owner
      .get("/storefront/v1/theme")
      .set("Host", hostname)
      .expect(200);
    expect(beforePublish.body.data).toBeNull();

    // Editing a template with a section type outside the manifest is rejected.
    await owner
      .patch(`${base}/themes/${installed.id}/versions/${draftVersionId}/templates/home/default`)
      .send({
        configuration: {
          sections: { s1: { type: "not-a-real-section", settings: {}, blocks: {}, blockOrder: [] } },
          sectionOrder: ["s1"],
        },
      })
      .expect(400);

    const updatedTemplate = (
      await owner
        .patch(`${base}/themes/${installed.id}/versions/${draftVersionId}/templates/home/default`)
        .send({
          configuration: {
            sections: {
              s1: {
                type: "hero",
                settings: { heading: "Welcome to Theme Co" },
                blocks: { b1: { type: "button", settings: { label: "Shop now" } } },
                blockOrder: ["b1"],
              },
            },
            sectionOrder: ["s1"],
          },
        })
        .expect(200)
    ).body.data;
    expect(updatedTemplate.configuration.sections.s1.settings.heading).toBe("Welcome to Theme Co");

    await owner
      .patch(`${base}/themes/${installed.id}/versions/${draftVersionId}/settings`)
      .send({ globalSettings: { primaryColor: "#ff0000" } })
      .expect(200);

    await owner
      .patch(`${base}/themes/${installed.id}/versions/${draftVersionId}/settings`)
      .send({ globalSettings: { notARealSetting: 1 } })
      .expect(400);

    const published = (
      await owner
        .post(`${base}/themes/${installed.id}/versions/${draftVersionId}/publish`)
        .send({})
        .expect(201)
    ).body.data;
    expect(published.role).toBe("main");
    expect(published.publishedVersionId).toBe(draftVersionId);
    // Publishing opened a fresh draft for continued editing.
    expect(published.versions).toHaveLength(2);
    expect(published.versions.find((v: { id: string }) => v.id === draftVersionId).status).toBe(
      "published",
    );

    const resolved = (
      await owner.get("/storefront/v1/theme").set("Host", hostname).expect(200)
    ).body.data;
    expect(resolved.versionId).toBe(draftVersionId);
    expect(resolved.globalSettings.primaryColor).toBe("#ff0000");
    expect(resolved.templates["home.default"].sections.s1.settings.heading).toBe("Welcome to Theme Co");

    // Editing the now-published version is refused — only the new draft can be edited.
    await owner
      .patch(`${base}/themes/${installed.id}/versions/${draftVersionId}/settings`)
      .send({ globalSettings: { primaryColor: "#00ff00" } })
      .expect(409);

    // Preview token: the storefront resolves the new (unpublished) draft through it, without
    // the token holder ever needing a merchant session.
    const newDraftId = published.versions.find((v: { status: string }) => v.status === "draft").id;
    await owner
      .patch(`${base}/themes/${installed.id}/versions/${newDraftId}/settings`)
      .send({ globalSettings: { primaryColor: "#0000ff" } })
      .expect(200);
    const { token } = (
      await owner.post(`${base}/themes/${installed.id}/versions/${newDraftId}/preview-token`).send({}).expect(201)
    ).body.data;

    const previewer = t.http();
    const preview = (
      await previewer.get(`/storefront/v1/theme/preview?token=${token}`).set("Host", hostname).expect(200)
    ).body.data;
    expect(preview.versionId).toBe(newDraftId);
    expect(preview.globalSettings.primaryColor).toBe("#0000ff");

    await previewer.get("/storefront/v1/theme/preview?token=not-a-real-token").set("Host", hostname).expect(404);
    await previewer.get("/storefront/v1/theme/preview").set("Host", hostname).expect(404);

    // Rollback: copy the original published version's settings/templates back over the current
    // draft, without touching the published version itself.
    const beforeRollback = await owner.get(`${base}/themes/${installed.id}/versions/${newDraftId}`).expect(200);
    expect(beforeRollback.body.data.globalSettings.primaryColor).toBe("#0000ff");

    const rolledBack = (
      await owner.post(`${base}/themes/${installed.id}/versions/${draftVersionId}/rollback`).send({}).expect(201)
    ).body.data;
    expect(rolledBack.id).toBe(newDraftId);
    expect(rolledBack.globalSettings.primaryColor).toBe("#ff0000");
    expect(rolledBack.templates.find((t: { templateType: string }) => t.templateType === "home").configuration.sections.s1.settings.heading).toBe(
      "Welcome to Theme Co",
    );

    const targetUnchanged = await owner.get(`${base}/themes/${installed.id}/versions/${draftVersionId}`).expect(200);
    expect(targetUnchanged.body.data.globalSettings.primaryColor).toBe("#ff0000");

    // Rolling back into itself, or rolling back when there's no draft (nothing here — both
    // guarded server-side), is refused.
    await owner
      .post(`${base}/themes/${installed.id}/versions/${newDraftId}/rollback`)
      .send({})
      .expect(409);
  });

  it("gates writes behind themes.edit/publish and hides themes across tenants", async () => {
    const viewerEmail = uniqueEmail("viewer");
    await owner.post(`${base}/invitations`).send({ email: viewerEmail, role: "viewer" }).expect(201);
    const inviteToken = linkToken(t.mail.lastTo(viewerEmail)?.text, "invitations");
    const viewer = t.http();
    await signupVerified(t, viewer, viewerEmail);
    await viewer.post("/admin/v1/invitations/accept").send({ token: inviteToken }).expect(200);
    const forbidden = await viewer.post(`${base}/themes`).send({ themeId }).expect(403);
    expect(forbidden.body.error.missing).toEqual(["themes.edit"]);

    const stranger = t.http();
    await signupVerified(t, stranger);
    const other = await createOrgAndStore(stranger, "Other Theme Co");
    const otherBase = `/admin/v1/stores/${other.storeId}`;
    expect((await stranger.get(`${otherBase}/themes`).expect(200)).body.data).toEqual([]);
    await stranger.get(`${base}/themes`).expect(404);
  });
});
