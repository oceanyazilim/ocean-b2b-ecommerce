import { authenticator } from "otplib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  assertInfraReachable,
  createTestApp,
  INTEGRATION_ENABLED,
  PASSWORD,
  signupVerified,
  type TestApp,
} from "./integration";

describe.skipIf(!INTEGRATION_ENABLED)("mfa, sessions and login history", () => {
  let t: TestApp;

  beforeAll(async () => {
    await assertInfraReachable();
    t = await createTestApp();
  });
  afterAll(async () => {
    await t?.close();
  });

  it("enrols, challenges on login, accepts totp and recovery codes once", async () => {
    const owner = t.http();
    const { email } = await signupVerified(t, owner);

    const before = await owner.get("/admin/v1/auth/mfa").expect(200);
    expect(before.body.data.enabled).toBe(false);

    const setup = await owner.post("/admin/v1/auth/mfa/setup").expect(200);
    const secret = setup.body.data.secret as string;
    expect(setup.body.data.qrDataUrl).toMatch(/^data:image\/png;base64,/);

    const bad = await owner.post("/admin/v1/auth/mfa/enable").send({ code: "000000" }).expect(400);
    expect(bad.body.error.fields[0].path).toBe("code");

    const enabled = await owner
      .post("/admin/v1/auth/mfa/enable")
      .send({ code: authenticator.generate(secret) })
      .expect(200);
    const codes = enabled.body.data.recoveryCodes as string[];
    expect(codes).toHaveLength(10);

    const status = await owner.get("/admin/v1/auth/mfa").expect(200);
    expect(status.body.data).toMatchObject({ enabled: true, recoveryCodesRemaining: 10 });
    const me = await owner.get("/admin/v1/auth/me").expect(200);
    expect(me.body.data.user.mfaEnabled).toBe(true);

    // Password alone no longer yields a session.
    const fresh = t.http();
    const login = await fresh
      .post("/admin/v1/auth/login")
      .send({ email, password: PASSWORD })
      .expect(200);
    expect(login.body.data.mfaRequired).toBe(true);
    expect(login.headers["set-cookie"]).toBeUndefined();
    await fresh.get("/admin/v1/auth/me").expect(401);
    const challengeToken = login.body.data.challengeToken as string;

    const wrong = await fresh
      .post("/admin/v1/auth/mfa/verify")
      .send({ challengeToken, code: "123456" })
      .expect(401);
    expect(wrong.body.error.code).toBe("unauthenticated");

    const ok = await fresh
      .post("/admin/v1/auth/mfa/verify")
      .send({ challengeToken, code: authenticator.generate(secret) })
      .expect(200);
    expect(ok.body.data.user.email).toBe(email);
    await fresh.get("/admin/v1/auth/me").expect(200);

    // Challenge is single-use.
    await fresh
      .post("/admin/v1/auth/mfa/verify")
      .send({ challengeToken, code: authenticator.generate(secret) })
      .expect(401);

    // Recovery code works exactly once.
    const viaRecovery = t.http();
    const login2 = await viaRecovery
      .post("/admin/v1/auth/login")
      .send({ email, password: PASSWORD })
      .expect(200);
    await viaRecovery
      .post("/admin/v1/auth/mfa/verify")
      .send({ challengeToken: login2.body.data.challengeToken, code: codes[0] })
      .expect(200);
    const login3 = await t
      .http()
      .post("/admin/v1/auth/login")
      .send({ email, password: PASSWORD })
      .expect(200);
    await t
      .http()
      .post("/admin/v1/auth/mfa/verify")
      .send({ challengeToken: login3.body.data.challengeToken, code: codes[0] })
      .expect(401);
    const after = await owner.get("/admin/v1/auth/mfa").expect(200);
    expect(after.body.data.recoveryCodesRemaining).toBe(9);

    // Login history reflects the journey.
    const events = await owner.get("/admin/v1/auth/login-events").expect(200);
    const outcomes = events.body.data.map((e: { outcome: string }) => e.outcome);
    expect(outcomes).toEqual(expect.arrayContaining(["success", "mfa_required", "failed_mfa"]));

    // Disabling needs password + a valid code.
    await owner
      .post("/admin/v1/auth/mfa/disable")
      .send({ password: "wrong-password-x", code: authenticator.generate(secret) })
      .expect(400);
    await owner
      .post("/admin/v1/auth/mfa/disable")
      .send({ password: PASSWORD, code: authenticator.generate(secret) })
      .expect(204);
    const plain = await t
      .http()
      .post("/admin/v1/auth/login")
      .send({ email, password: PASSWORD })
      .expect(200);
    expect(plain.body.data.user.email).toBe(email);
  });

  it("lists sessions and revokes them individually or all others", async () => {
    const a = t.http();
    const { email } = await signupVerified(t, a);
    const b = t.http();
    await b.post("/admin/v1/auth/login").send({ email, password: PASSWORD }).expect(200);
    const c = t.http();
    await c.post("/admin/v1/auth/login").send({ email, password: PASSWORD }).expect(200);

    const list = await a.get("/admin/v1/auth/sessions").expect(200);
    expect(list.body.data).toHaveLength(3);
    expect(list.body.data.filter((s: { current: boolean }) => s.current)).toHaveLength(1);

    const other = list.body.data.find((s: { current: boolean }) => !s.current);
    await a.delete(`/admin/v1/auth/sessions/${other.id}`).expect(204);
    await a.delete("/admin/v1/auth/sessions/not-a-real-session").expect(404);

    const revoked = await a.delete("/admin/v1/auth/sessions").expect(200);
    expect(revoked.body.data.revoked).toBe(1);
    await b.get("/admin/v1/auth/me").expect(401);
    await c.get("/admin/v1/auth/me").expect(401);
    await a.get("/admin/v1/auth/me").expect(200);
  });

  it("flags sign-ins from a new ip and notifies accounts without mfa", async () => {
    const first = t.http();
    const { email } = await signupVerified(t, first);
    await first.post("/admin/v1/auth/login").send({ email, password: PASSWORD }).expect(200);

    const elsewhere = t.http();
    await elsewhere.post("/admin/v1/auth/login").send({ email, password: PASSWORD }).expect(200);

    const events = await first.get("/admin/v1/auth/login-events").expect(200);
    const latest = events.body.data[0];
    expect(latest.outcome).toBe("success");
    expect(latest.riskFlags).toContain("new_ip");
    expect(t.mail.lastTo(email)?.subject).toMatch(/new sign-in/i);
  });
});
