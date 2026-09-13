import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  assertInfraReachable,
  createTestApp,
  INTEGRATION_ENABLED,
  linkToken,
  PASSWORD,
  signupVerified,
  uniqueEmail,
  type TestApp,
} from "./integration";

describe.skipIf(!INTEGRATION_ENABLED)("auth flow", () => {
  let t: TestApp;

  beforeAll(async () => {
    await assertInfraReachable();
    t = await createTestApp();
  });
  afterAll(async () => {
    await t?.close();
  });

  it("signs up, sends a verification mail, and starts a session", async () => {
    const agent = t.http();
    const email = uniqueEmail();
    const res = await agent
      .post("/admin/v1/auth/signup")
      .send({ email, name: "Ada", password: PASSWORD })
      .expect(201);

    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.user.emailVerified).toBe(false);
    expect(res.headers["set-cookie"]?.[0]).toMatch(/^ocean_ms=/);
    expect(t.mail.lastTo(email)?.subject).toMatch(/verify/i);

    const me = await agent.get("/admin/v1/auth/me").expect(200);
    expect(me.body.data.user.email).toBe(email);
    expect(me.body.data.organizations).toEqual([]);
  });

  it("rejects duplicate signups with a field error", async () => {
    const agent = t.http();
    const { email } = await signupVerified(t, agent);
    const res = await t
      .http()
      .post("/admin/v1/auth/signup")
      .send({ email, name: "Dup", password: PASSWORD })
      .expect(409);
    expect(res.body.error.code).toBe("conflict");
    expect(res.body.error.fields[0].path).toBe("email");
    expect(res.body.error.requestId).toMatch(/^req_/);
  });

  it("verifies email once and refuses a reused token", async () => {
    const agent = t.http();
    const email = uniqueEmail();
    await agent.post("/admin/v1/auth/signup").send({ email, name: "Ada", password: PASSWORD });
    const token = linkToken(t.mail.lastTo(email)?.text, "token");

    const ok = await agent.post("/admin/v1/auth/verify-email").send({ token }).expect(200);
    expect(ok.body.data.user.emailVerified).toBe(true);

    const again = await agent.post("/admin/v1/auth/verify-email").send({ token }).expect(400);
    expect(again.body.error.code).toBe("validation_error");
  });

  it("logs in with the right password and rejects the wrong one without leaking which", async () => {
    const { email } = await signupVerified(t, t.http());

    const bad = await t
      .http()
      .post("/admin/v1/auth/login")
      .send({ email, password: "wrong-password-1" })
      .expect(401);
    const unknown = await t
      .http()
      .post("/admin/v1/auth/login")
      .send({ email: uniqueEmail("nobody"), password: "wrong-password-1" })
      .expect(401);
    expect(bad.body.error.message).toBe(unknown.body.error.message);

    const agent = t.http();
    await agent.post("/admin/v1/auth/login").send({ email, password: PASSWORD }).expect(200);
    await agent.get("/admin/v1/auth/me").expect(200);
  });

  it("logout ends the session", async () => {
    const agent = t.http();
    await signupVerified(t, agent);
    await agent.post("/admin/v1/auth/logout").expect(204);
    const res = await agent.get("/admin/v1/auth/me").expect(401);
    expect(res.body.error.code).toBe("unauthenticated");
  });

  it("password reset revokes every session and the new password works", async () => {
    const agentA = t.http();
    const { email } = await signupVerified(t, agentA);
    const agentB = t.http();
    await agentB.post("/admin/v1/auth/login").send({ email, password: PASSWORD }).expect(200);

    await t.http().post("/admin/v1/auth/forgot-password").send({ email }).expect(204);
    const token = linkToken(t.mail.lastTo(email)?.text, "token");
    const newPassword = "NewHorse!4242";
    await t
      .http()
      .post("/admin/v1/auth/reset-password")
      .send({ token, password: newPassword })
      .expect(204);

    await agentA.get("/admin/v1/auth/me").expect(401);
    await agentB.get("/admin/v1/auth/me").expect(401);
    await t.http().post("/admin/v1/auth/login").send({ email, password: PASSWORD }).expect(401);
    await t.http().post("/admin/v1/auth/login").send({ email, password: newPassword }).expect(200);
  });

  it("forgot-password never reveals whether an account exists", async () => {
    await t
      .http()
      .post("/admin/v1/auth/forgot-password")
      .send({ email: uniqueEmail("ghost") })
      .expect(204);
  });

  it("validates bodies with field-level errors", async () => {
    const res = await t
      .http()
      .post("/admin/v1/auth/signup")
      .send({ email: "not-an-email", name: "", password: "short" })
      .expect(400);
    expect(res.body.error.code).toBe("validation_error");
    const paths = res.body.error.fields.map((f: { path: string }) => f.path);
    expect(paths).toEqual(expect.arrayContaining(["email", "name", "password"]));
  });
});
